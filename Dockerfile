FROM oven/bun:1.3-alpine

WORKDIR /app

# 复制依赖文件
COPY package.json bun.lockb* ./

# 安装依赖
RUN bun install --production

# 复制源代码
COPY . .

# 暴露端口
EXPOSE 8080

# 启动服务
CMD ["bun", "run", "start"]
