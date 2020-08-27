# My first docker hope it isn't too bad :)
FROM node:12

WORKDIR /var/www/jeffdownloader/

RUN git clone https://gitlab.com/LoicBersier/jeff-downloader.git .

RUN npm install

RUN npm i -g @adonisjs/cli

RUN cp .env.example .env

RUN echo "[]" > proxy/proxy.json

RUN adonis key:generate

EXPOSE 3333

CMD ["adonis", "serve"]
