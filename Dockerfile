# 1. Use node image
FROM node:20-alpine as base

RUN apk update && apk add jq make

# 2. Set working directory
WORKDIR /app

# 3. Copy package.json and yarn.lock
COPY package.json yarn.lock ./

# 4. Install dependencies
RUN yarn install

# 5. Copy source code
COPY . ./

# 6. compile and bundle
RUN yarn build

FROM base as runner

# 7. Copy dist
COPY --from=base /app/dist ./dist

# 8. Start
CMD ["node", "dist/index.js"]
