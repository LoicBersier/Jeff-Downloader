# My first docker hope it isn't too bad :)
FROM node:12

WORKDIR /var/www/jeffdownloader/

RUN git clone https://git.namejeff.xyz/Supositware/jeff-downloader.git .

RUN npm install

RUN npm i -g pm2

RUN cp .env.example .env

RUN echo "[]" > proxy/proxy.json

RUN apt-get update &&  apt-get install -y ffmpeg

EXPOSE 3333

CMD ["pm2-runtime", "server.js"]
