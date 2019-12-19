'use strict'
const youtubedl = require('youtube-dl')
const fs = require('fs')
const ffmpeg = require('fluent-ffmpeg')
const pJson = require('../../../package.json');

let viewCounter = 0;
let files = [];
let day;
let month;
let announcementArray = ['Twitter download seems to work fine now!', 'u lookin hot today vro', 'I am not responsible for what you download', 'If you want to support me you can donate through my paypal at the bottom of the page', 'Did you know this website is open source?', 'Did you know this website can download from other website than youtube?', 'You can mouse hover a video to see a preview of it!']
let announcement
let title = `le epic downloader v${pJson.version}`;

class DownloadController {

  async index ({ view, response }) {
    // Get random announcement
    announcement = announcementArray[Math.floor(Math.random() * announcementArray.length)];

    // Get date for some event
    let today = new Date();
    day = today.getDay();
    month = today.getMonth();

    viewCounter++;
    if (response.request.url == '/legacy') return view.render('legacy', { title: title, viewCounter: viewCounter, day: day, month: month, announcement: announcement});

    files = [];
    let file = []
    for (let f of fs.readdirSync('./public/uploads')) {
      file.push(f)
    }
    // get the 5 most recent files
    file = file.sort(function(a, b) {
      if (((a || b).endsWith('.mp4') || (a || b).endsWith('.webm') || (a || b).endsWith('.mp3') || (a || b).endsWith('.flac')) && !(a || b).startsWith('HIDE')) {
        let time1 = fs.statSync(`./public/uploads/${b}`).ctime;
        let time2 = fs.statSync(`./public/uploads/${a}`).ctime; 
        if (time1 < time2) return -1;
        if (time1 > time2) return 1;
      }
      return 0;
    }).slice(0, 5)

    file.forEach((file) => {
      // If mp4 and is not to be hidden from the recent feed
      if ((file.endsWith('.mp4') || file.endsWith('.webm')) && !file.startsWith('HIDE')) {
        let fileInfo = fs.statSync(`./public/uploads/${file}`);
        /*
        // Take screenshot at the first frame of the mp4 file

        ffmpeg(`./public/uploads/${file}`)
        .takeScreenshots({ count: 1, timemarks: [ 1 ], size: '720x480', filename: file + '.png' }, 'public/thumbnail')
        .on('error', (err) => {
          console.error(err);
          return;
        });
        */

        // Send file name, file size in MB relative path for the file
        files.push({ name: file, size: (fileInfo.size / 1000000.0).toFixed(2), location: `uploads/${file}` });
        
        // If mp3 or flac and not to be hidden from the recent feed
      } else if ((file.endsWith('.mp3') || file.endsWith('.flac')) && !file.startsWith('HIDE')) {
        let fileInfo = fs.statSync(`./public/uploads/${file}`);
        // Send file name, file size in MB relative path for the file and relative path of music.png
        files.push({ name: file, size: (fileInfo.size / 1000000.0).toFixed(2), location: `uploads/${file}`, img: `/asset/music.png` });
      }
    });
		return view.render('index', { title: title, viewCounter: viewCounter, file: files, day: day, month: month, announcement: announcement });
  }

  async download({ view, request, response }) {
    let page = 'index';
    if (response.request.url == '/legacy') page = 'legacy';
      // To be honest i forgot what it does, but i think i need it
      response.implicitEnd = false

      let option, DLFile
      // Get form input
      let data = {
        url: request.input('URL'),
        quality: request.input('quality'),
        format: request.input('format'),
        alt: request.input('alt'),
        feed: request.input('feed')
      }

      if (!data.url) {
        return view.render(page, {
          title: title,
          viewCounter: viewCounter,
          file: files,
          day: day, month: month, announcement: announcement ,
          error: true,
          errormsg: 'bruh moment, you didin\'t input a link.'
        });
      }

      // Youtube-dl quality settings
      if (data.quality == 'small')
        option = 'worst'
      else
        option = 'best'

      // If alt download ( Quality settings and file format option doesn't work here )
      if (data.alt) {
        if (fs.existsSync('./public/uploads/alt.mp4')) {
          fs.unlink('./public/uploads/alt.mp4', (err) => {
            if (err);
          });
        }
  
        return youtubedl.exec(data.url, ['--format=mp4', '-o', `public/uploads/alt.mp4`], {}, function(err, output) {
          if (err) {
            return view.render(page, {
              title: title,
              viewCounter: viewCounter,
              file: files,
              day: day, month: month, announcement: announcement ,
              error: true,
              errormsg: 'bruh moment, you didin\'t input a valid link.'
            });
          }
  
          return response.attachment('./public/uploads/alt.mp4');
        });
      } else {
        // Download as mp4 if possible
        let video = youtubedl(data.url, ['--format=mp4', '-f', option]);

        video.on('error', function(err) {
          console.error(err);
          return view.render(page, {
            title: title,
            viewCounter: viewCounter,
            file: files,
            day: day, month: month, announcement: announcement ,
            error: true,
            errormsg: 'bruh moment, you didin\'t input a valid link.'
          });
      })

        let ext;
        video.on('info', function(info) {
          // Set file name
          ext = info.ext;
          let title = info.title.slice(0,80);
          DLFile = `${title.replace(/\s/g, '_')}.${ext}`;

          // If no title use the ID
          if (title == '_') title = `_${info.id}`;
          // If user want to hide from the feed 
          if (data.feed == 'on') 
            DLFile = `HIDE${title.replace(/\s/g, '_')}.${ext}`;

          DLFile = DLFile.replace(/[()]/g, '_');
          video.pipe(fs.createWriteStream(`./public/uploads/${DLFile}`));
        });

        video.on('end', function() {
          if (data.format == 'mp4' || data.format == 'webm') {
            // If user requested mp4 directly attach the file
            return response.attachment(`./public/uploads/${DLFile}`)
          } else {
            // If user requested an audio format, convert it
            ffmpeg(`./public/uploads/${DLFile}`)
            .noVideo()
            .audioChannels('2')
            .audioFrequency('44100')
            .audioBitrate('320k')
            .format(data.format)
            .save(`./public/uploads/${DLFile.replace(ext, `.${data.format}`)}`)
            .on('end', () => {
              fs.unlinkSync(`./public/uploads/${DLFile}`);
              return response.attachment(`./public/uploads/${DLFile.replace(ext, `.${data.format}`)}`);
            })
          }
        });
      }
  }
}

module.exports = DownloadController
