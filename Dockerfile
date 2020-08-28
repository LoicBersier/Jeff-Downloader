# My first docker hope it isn't too bad :)
FROM node:12

WORKDIR /var/www/jeffdownloader/

RUN git clone https://gitlab.com/LoicBersier/jeff-downloader.git .

RUN npm install

RUN npm i -g pm2

RUN cp .env.example .env

RUN echo "[]" > proxy/proxy.json

EXPOSE 3333

CMD ["pm2-runtime", "server.js"]
