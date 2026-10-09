# 共享停车后端 - 容器镜像
# 零依赖 Node.js 服务，仅需 server.js 与 package.json
FROM node:18-alpine

WORKDIR /app

# 仅复制运行所需文件（config.json / data.json 不进镜像，改用环境变量 + 运行时生成）
COPY package.json server.js ./

# 端口可由环境变量 PORT 覆盖（默认 3000）
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
