# My first docker hope it isn't too bad :)
FROM node:14

WORKDIR /var/www/jeffdownloader/

RUN git clone https://git.namejeff.xyz/Supositware/jeff-downloader.git .

RUN git checkout progress

RUN npm install

RUN npm i -g pm2

RUN echo "[]" > proxy/proxy.json

RUN NODE_ENV=production

RUN PORT=3333

RUN apt-get update && apt-get install -y ffmpeg

EXPOSE 3333

CMD ["pm2-runtime", "bin/www"]