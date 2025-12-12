# Node 20 slim 버전 사용
FROM node:20-slim

# 작업 디렉토리
WORKDIR /app

# 패키지 설치
COPY package*.json ./
RUN npm install --legacy-peer-deps

# 소스 복사
COPY . .

# 빌드
RUN npm run build

# Next.js는 기본적으로 3000번 포트
EXPOSE 8080

# Cloud Run은 PORT env를 강제하므로 runtime에서 바꿔줘야 함
ENV PORT=8080

CMD ["npm", "run", "start"]
