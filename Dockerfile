FROM node:lts-trixie-slim
SHELL ["bash", "-c"]
WORKDIR /home/node
COPY --chown=node:staff package.json .
USER node
RUN npm i --omit=dev
COPY --chown=node:staff app app
ENV TZ Asia/Tokyo
CMD ["npm", "start"]
