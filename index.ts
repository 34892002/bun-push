import { serve } from "bun";
import { Database } from "bun:sqlite";

// 环境变量配置
const SENDKEY = process.env.SENDKEY;
const WECOM_CID = process.env.WECOM_CID;
const WECOM_SECRET = process.env.WECOM_SECRET;
const WECOM_AID = process.env.WECOM_AID;
const WECOM_TOUID = process.env.WECOM_TOUID || "@all";

// 检查必要的环境变量
if (!SENDKEY) {
  console.error("错误：未配置 SENDKEY 环境变量");
  process.exit(1);
}
if (!WECOM_CID) {
  console.error("错误：未配置 WECOM_CID 环境变量");
  process.exit(1);
}
if (!WECOM_SECRET) {
  console.error("错误：未配置 WECOM_SECRET 环境变量");
  process.exit(1);
}
if (!WECOM_AID) {
  console.error("错误：未配置 WECOM_AID 环境变量");
  process.exit(1);
}

// 企业微信API
const GET_TOKEN_API = "https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=%s&corpsecret=%s";
const SEND_MESSAGE_API = "https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=%s";
const UPLOAD_MEDIA_API = "https://qyapi.weixin.qq.com/cgi-bin/media/upload?access_token=%s&type=%s";

// SQLite 数据库初始化
const db = new Database("token.db");
db.run(`
  CREATE TABLE IF NOT EXISTS tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    access_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  )
`);

interface JsonData {
  touser: string;
  agentid: string;
  msgtype: string;
  duplicate_check_interval: number;
  text?: { content: string };
  image?: { media_id: string };
}

interface RequestBody {
  msg?: string;
  msg_type?: string;
  image_base64?: string;
  image_filename?: string;
}

async function getRemoteToken(corpId: string, appSecret: string): Promise<string> {
  const url = GET_TOKEN_API.replace("%s", corpId).replace("%s", appSecret);
  console.log("getTokenUrl==>", url);
  const response = await fetch(url);
  const data = await response.json();
  console.log("企业微信获取access_token接口返回==>", data);
  
  if (data.errcode) {
    throw new Error(`获取token失败: ${data.errmsg}`);
  }
  
  const accessToken = data.access_token;
  const expiresAt = Math.floor(Date.now() / 1000) + 7000; // 7000秒后过期
  
  // 存储到SQLite
  db.run("DELETE FROM tokens"); // 清除旧token
  db.run("INSERT INTO tokens (access_token, expires_at) VALUES (?, ?)", [accessToken, expiresAt]);
  
  return accessToken;
}

async function getAccessToken(): Promise<string> {
  // 从SQLite获取token
  const row = db.query("SELECT access_token, expires_at FROM tokens ORDER BY id DESC LIMIT 1").get() as any;
  
  if (row) {
    const now = Math.floor(Date.now() / 1000);
    if (now < row.expires_at) {
      console.log("从数据库获取token");
      return row.access_token;
    } else {
      console.log("token已过期，重新获取");
    }
  }
  
  console.log("从远程API获取token");
  return await getRemoteToken(WECOM_CID!, WECOM_SECRET!);
}

function validateToken(errcode: any): boolean {
  if (errcode === 42001) {
    console.log("token已失效，开始删除数据库中的token");
    db.run("DELETE FROM tokens");
    console.log("删除数据库中的token完毕");
    console.log("现需重新获取token");
    return false;
  }
  return true;
}

async function uploadMedia(msgType: string, file: File, accessToken: string): Promise<{ mediaId: string; errcode: number }> {
  const url = UPLOAD_MEDIA_API.replace("%s", accessToken).replace("%s", msgType);
  console.log("uploadMediaUrl==>", url);

  const formData = new FormData();
  formData.append("media", file);

  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });
  const data = await response.json();
  console.log("企业微信上传临时素材接口返回==>", data);

  if (data.errcode && data.errcode !== 0) {
    return { mediaId: "", errcode: data.errcode };
  }
  return { mediaId: data.media_id, errcode: 0 };
}

async function postMsg(postData: JsonData, postUrl: string): Promise<string> {
  console.log("postJson ", JSON.stringify(postData));
  console.log("postUrl ", postUrl);
  const response = await fetch(postUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(postData),
  });
  const data = await response.json();
  console.log("企业微信发送应用消息接口返回==>", data);
  return JSON.stringify(data);
}

function initJsonData(msgType: string): JsonData {
  return {
    touser: WECOM_TOUID!,
    agentid: WECOM_AID!,
    msgtype: msgType,
    duplicate_check_interval: 600,
  };
}

function base64ToFile(base64: string, filename: string): File {
  // 从base64解码为Buffer
  const buffer = Buffer.from(base64, 'base64');
  // 创建File对象
  return new File([buffer], filename, { type: 'image/jpeg' });
}

const server = serve({
  port: 8080,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/workwx") {
      // 从查询参数获取sendkey
      const sendkey = url.searchParams.get("sendkey");
      if (!sendkey || sendkey !== SENDKEY) {
        console.error("sendkey 错误，请检查");
        return new Response(JSON.stringify({ error: "sendkey错误或缺失" }), { status: 401 });
      }
      
      // 检查Content-Type
      const contentType = request.headers.get("content-type") || "";
      
      let body: RequestBody;
      
      if (contentType.includes("application/json")) {
        // 解析JSON请求体
        try {
          body = await request.json();
        } catch (e) {
          return new Response(JSON.stringify({ error: "无效的JSON格式" }), { status: 400 });
        }
      } else {
        return new Response(JSON.stringify({ error: "请使用application/json格式" }), { status: 415 });
      }
      
      const msgContent = body.msg || "";
      const msgType = body.msg_type || "text";
      console.log("mes_type=", msgType);
      
      // 获取token
      let accessToken = await getAccessToken();
      // 默认token有效
      let tokenValid = true;
      
      // 默认mediaId为空
      let mediaId = "";
      if (msgType !== "image") {
        console.log("消息类型不是图片");
      } else {
        // 处理图片上传
        if (!body.image_base64) {
          return new Response(JSON.stringify({ error: "缺少image_base64字段" }), { status: 400 });
        }
        
        const filename = body.image_filename || "image.jpg";
        const file = base64ToFile(body.image_base64, filename);
        
        // token有效则跳出循环继续执行，否则重试3次
        for (let i = 0; i <= 3; i++) {
          const result = await uploadMedia(msgType, file, accessToken);
          console.log(`企业微信上传临时素材接口返回的media_id==>[${result.mediaId}], errcode==>[${result.errcode}]`);
          tokenValid = validateToken(result.errcode);
          if (tokenValid) {
            mediaId = result.mediaId;
            break;
          }
          accessToken = await getAccessToken();
        }
      }
      
      // 准备发送应用消息所需参数
      const postData = initJsonData(msgType);
      if (msgType === "text") {
        postData.text = { content: msgContent };
      } else if (msgType === "image") {
        postData.image = { media_id: mediaId };
      }
      
      let postStatus = "";
      for (let i = 0; i <= 3; i++) {
        const sendMessageUrl = SEND_MESSAGE_API.replace("%s", accessToken);
        postStatus = await postMsg(postData, sendMessageUrl);
        const postResponse = JSON.parse(postStatus);
        const errcode = postResponse.errcode;
        console.log("发送应用消息接口返回errcode==>", errcode);
        tokenValid = validateToken(errcode);
        if (tokenValid) {
          break;
        }
        // 刷新token
        accessToken = await getAccessToken();
      }
      
      return new Response(postStatus, {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Bun server running at http://0.0.0.0:${server.port}`);