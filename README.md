# BunJS 推送消息服务

基于 BunJS 的消息推送服务，目前支持企业微信。

## 功能

- 支持文本消息推送
- 支持图片消息推送（base64 编码）
- 自动重试机制（token 失效时）
- 使用 SQLite 缓存 access_token

## 环境变量

| 变量名 | 说明 | 是否必填 |
|--------|------|----------|
| `SENDKEY` | 推送密钥 | 必填 |
| `WECOM_CID` | 企业微信公司ID | 必填 |
| `WECOM_SECRET` | 企业微信应用Secret | 必填 |
| `WECOM_AID` | 企业微信应用ID | 必填 |
| `WECOM_TOUID` | 推送用户ID，`@all`表示所有人 | 可选（默认 `@all`） |

**注意：** `WECOM_CID`、`WECOM_SECRET`、`WECOM_AID` 为核心参数，必须配置，否则服务无法启动。

## API 端点

### `POST /wecomchan`

推送消息接口，请求格式为 `application/json`。

**查询参数：**
- `sendkey`：推送密钥（必填）

**请求体参数：**
- `msg`：消息内容（文本消息必填）
- `msg_type`：消息类型，`text` 或 `image`（默认 `text`）
- `image_base64`：图片的 base64 编码（图片消息必填）
- `image_filename`：图片文件名（可选，默认 `image.jpg`）

**示例：**

```bash
# 文本消息
curl -X POST "http://localhost:8080/wecomchan?sendkey=your_sendkey" \
  -H "Content-Type: application/json" \
  -d '{"msg": "Hello", "msg_type": "text"}'

# 图片消息
curl -X POST "http://localhost:8080/wecomchan?sendkey=your_sendkey" \
  -H "Content-Type: application/json" \
  -d '{"msg_type": "image", "image_base64": "/9j/4AAQSkZJRgABAQEASABIAAD...", "image_filename": "test.jpg"}'
```

## 运行

### 本地运行

```bash
# 安装依赖
bun install

# 设置环境变量
export SENDKEY=your_sendkey
export WECOM_CID=your_corp_id
export WECOM_SECRET=your_corp_secret
export WECOM_AID=your_agent_id

# 启动服务
bun run start

# 开发模式（自动重启）
bun run dev
```

### Docker 运行

```bash
# 构建镜像
docker build -t bun-push .

# 运行容器
docker run -p 8080:8080 \
  -e SENDKEY=your_sendkey \
  -e WECOM_CID=your_cid \
  -e WECOM_SECRET=your_secret \
  -e WECOM_AID=your_aid \
  bun-push
```

### Docker Compose

```bash
# 修改 docker-compose.yml 中的环境变量
# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### GitHub Packages

推送到 GitHub 后自动构建 Docker 镜像并发布到 GitHub Packages。

```bash
# 拉取镜像
docker pull ghcr.io/34892002/bun-push:latest

# 运行容器
docker run -p 8080:8080 \
  -e SENDKEY=your_sendkey \
  -e WECOM_CID=your_cid \
  -e WECOM_SECRET=your_secret \
  -e WECOM_AID=your_aid \
  ghcr.io/34892002/bun-push:latest
```

**说明：** 推送到 `main` 分支时会同时生成 `main` 和 `latest` 标签，推荐使用 `latest` 标签。

## 部署说明

1. 在企业微信管理后台创建应用，获取 `CorpID`、`Secret`、`AgentId`
2. 设置应用可见范围
3. 配置环境变量（必须配置 `SENDKEY`、`WECOM_CID`、`WECOM_SECRET`、`WECOM_AID`）
4. 启动服务
5. 使用 API 推送消息

## 注意事项

- 图片消息需要将图片转换为 base64 编码后传输
- access_token 有效期为 2 小时，会自动缓存到 SQLite 数据库
- 生产环境请务必修改 `SENDKEY`
- 核心环境变量（`WECOM_CID`、`WECOM_SECRET`、`WECOM_AID`）未配置时服务会报错退出
- 服务默认监听 0.0.0.0:8080，可从外部访问；如需仅本地访问，可修改代码指定 hostname 为 "127.0.0.1"
