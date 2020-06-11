'use strict'
const youtubedl = require('youtube-dl')
const fs = require('fs')
const ffmpeg = require('fluent-ffmpeg')
const { version } = require('../../../package.json');
const Ws = use('Ws');
const Antl = use('Antl');

let viewCounter = 0;
let files = [];
let day;
let month;
let announcementArray;
let announcement;

function formatBytes(bytes, decimals = 2) { // https://stackoverflow.com/a/18650828
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

class DownloadController {

  async index ({ view, request, locale }) {
    viewCounter++;
    // Coudln't find a cleaner way to make it change with the browser locale
    announcementArray = [Antl.forLocale(locale).formatMessage('announcement.1'), Antl.forLocale(locale).formatMessage('announcement.2'), Antl.forLocale(locale).formatMessage('announcement.3'), Antl.forLocale(locale).formatMessage('announcement.4'), Antl.forLocale(locale).formatMessage('announcement.5'), Antl.forLocale(locale).formatMessage('announcement.6'), 'Playlist download is experimental'];
    // Get random announcement
    announcement = announcementArray[Math.floor(Math.random() * announcementArray.length)];
    // Get date for some event
    let today = new Date();
    day = today.getDay();
    month = today.getMonth();
    // If legacy link return
    if (request.url() == '/legacy') return view.render('legacy', { version: version, viewCounter: viewCounter, day: day, month: month, announcement: announcement});

    files = [];
    let file = [];
    for (let f of fs.readdirSync('./public/uploads')) {
      file.push(f)
    }
    // get the 5 most recent files
    file = file.sort((a, b) => {
      if ((a || b).endsWith('.mp4') || (a || b).endsWith('.webm') || (a || b).endsWith('.mp3') || (a || b).endsWith('.flac') || (a || b).endsWith('.zip')) {
        let time1 = fs.statSync(`./public/uploads/${b}`).ctime;
        let time2 = fs.statSync(`./public/uploads/${a}`).ctime;
        if (time1 < time2) return -1;
        if (time1 > time2) return 1;
      }
      return 0;
    }).slice(0, 5)

    // Save space by deleting file that doesn't appear in the recent feed
    for (let f of fs.readdirSync('./public/uploads')) {
      if (!file.includes(f) && (f != 'hidden' && f != '.keep' && f != 'playlist')) {
        fs.unlinkSync(`./public/uploads/${f}`);
      }
    }

    for (let f of file) {
      if (f.endsWith('.mp4') || f.endsWith('.webm')) {
        // Send file name, file size in MB relative path for the file
        let fileInfo = formatBytes(fs.statSync(`./public/uploads/${f}`).size).split(' ');
        files.push({ name: f.split('.').slice(0, -1).join('.'), size: fileInfo[0], unit: fileInfo[1], date: fs.statSync(`./public/uploads/${f}`).ctime, location: `uploads/${f}`, ext: f.split('.').pop(), img: '' });
      } else if (f.endsWith('.mp3') || f.endsWith('.flac')) {
        // Send file name, file size in MB relative path for the file and relative path of music.png
        let fileInfo = formatBytes(fs.statSync(`./public/uploads/${f}`).size).split(' ');
        files.push({ name: f.split('.').slice(0, -1).join('.'), size: fileInfo[0], unit: fileInfo[1], date: fs.statSync(`./public/uploads/${f}`).ctime, location: `uploads/${f}`, ext: f.split('.').pop(), img: `/asset/music.png` });
      }
    }

		return view.render('index', { version: version, viewCounter: viewCounter, file: files, day: day, month: month, announcement: announcement});
  }

  async download({ view, request, response }) {
    const ws = Ws.getChannel('progress').topic('progress');
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
        if (ws) {
          ws.socket.emit('error', 'bruh moment, you didin\'t input a link.');
        }
        return;
      }

      // Youtube-dl quality settings
      if (data.quality == 'small')
        option = 'worst'
      else
        option = 'best'

      // If alt download ( Quality settings and file format option doesn't work here )
      if (data.alt) {
        let altFolder;
        if (data.feed == 'on') {
          altFolder = './public/uploads/hidden/alt.mp4';
        } else {
          altFolder = './public/uploads/alt.mp4'
        }

        if (fs.existsSync(altFolder)) {
          fs.unlink(altFolder, (err) => {
            if (err);
          });
        }

        return youtubedl.exec(data.url, ['--format=mp4', '-o', altFolder], {}, function(err, output) {
          if (err) {
            console.error(err);
            if (ws) {
              ws.socket.emit('error', err.toString());
            }
            return;
          }
          console.log(altFolder.slice(17))
          if (ws) {
            ws.socket.emit('end', altFolder.slice(17));
          }
          return;
        });
      } else {
        if (data.url.match( /^.*(youtu.be\/|list=)([^#\&\?]*).*/)) {
          playlistDownload(data)
        } else {
          // Download as mp4 if possible
          let video = youtubedl(data.url, ['--format=mp4', '-f', option]);

          video.on('error', function(err) {
            console.error(err);
            if (ws) {
              ws.socket.emit('error', err.toString());
            }
            return;
          })

          let ext;
          let size = 0
          video.on('info', function(info) {
            size = info.size
            // Set file name
            ext = info.ext;
            let title = info.title.slice(0,50);
            DLFile = `${title.replace(/\s/g, '_')}.${ext}`;
            DLFile = DLFile.replace(/[()]|[/]|[\\]|[?]|[!]/g, '_');

            // If no title use the ID
            if (title == '_') title = `_${info.id}`;
            // If user want to hide from the feed
            if (data.feed == 'on')
            DLFile = `hidden/${title}.${ext}`;

            video.pipe(fs.createWriteStream(`./public/uploads/${DLFile}`));
          });

          let pos = 0
          video.on('data', function data(chunk) {
            pos += chunk.length
            // `size` should not be 0 here.
            if (size) {
              let percent = (pos / size * 100).toFixed(2)
              if (ws) {
                ws.socket.emit('progress', percent);
              }
            }
          })

          video.on('end', function() {
            console.log('end');
            if (ws) {
              ws.socket.emit('message', 'end');
            }
            if (data.format == 'mp4' || data.format == 'webm') {
              // If user requested mp4 directly attach the file
              if (ws) {
                ws.socket.emit('end', DLFile);
              }
              return;
            } else {
              // If user requested an audio format, convert it
              ffmpeg(`./public/uploads/${DLFile}`)
              .noVideo()
              .audioChannels('2')
              .audioFrequency('44100')
              .audioBitrate('320k')
              .format(data.format)
              .save(`./public/uploads/${DLFile.replace(`.${ext}`, `.${data.format}`)}`)
              .on('progress', (progress) => {
                wb.broadcast(progress.percent)
              })
              .on('end', () => {
                fs.unlinkSync(`./public/uploads/${DLFile}`);
                if (ws) {
                  ws.socket.emit('end', DLFile.replace(`.${ext}`, `.${data.format}`));
                }
              });
            }
          });
        }
      }

      function playlistDownload(data) {
        const video = youtubedl(data.url)

        video.on('error', function error(err) {
          console.error(err);
          if (ws) {
            ws.socket.emit('error', err.toString());
          }
          return;
        });

        let ext;
        let size = 0
        video.on('info', function(info) {
          console.log(info);
          size = info.size
          // Set file name
          ext = info.ext;
          let title = info.title.slice(0,50);
          DLFile = `${title.replace(/\s/g, '_')}.${ext}`;
          DLFile = DLFile.replace(/[()]|[/]|[\\]|[?]|[!]/g, '_');

          // If no title use the ID
          if (title == '_') title = `_${info.id}`;
          // If user want to hide from the feed
          if (data.feed == 'on')
            DLFile = `hidden/playlist/${title}.${ext}`;

            video.pipe(fs.createWriteStream(`./public/uploads/playlist/${DLFile}`));
        });


        let pos = 0
        video.on('data', function data(chunk) {
          pos += chunk.length
          // `size` should not be 0 here.
          if (size) {
            let percent = (pos / size * 100).toFixed(2)
            process.stdout.cursorTo(0)
            process.stdout.clearLine(1)
            if (ws) {
              ws.socket.emit('progress', percent);
            }
          }
        });

        video.on('end', function() {
          if (data.format == 'mp3' || data.format == 'flac') {
            // If user requested an audio format, convert it
            ffmpeg(`./public/uploads/playlist/${DLFile}`)
            .noVideo()
            .audioChannels('2')
            .audioFrequency('44100')
            .audioBitrate('320k')
            .format(data.format)
            .save(`./public/uploads/playlist/${DLFile.replace(`.${ext}`, `.${data.format}`)}`)
            .on('progress', (progress) => {
              ws.socket.emit(progress.percent)
            })
            .on('end', () => {
              fs.unlinkSync(`./public/uploads/playlist/${DLFile}`);
              if (ws) {
                ws.socket.emit('end', `./public/uploads/playlist/${DLFile.replace(`.${ext}`, `.${data.format}`)}`);
              }
            });
          } else {
            if (ws) {
              ws.socket.emit('end', `./public/uploads/playlist/${DLFile}`);
            }
          }
        });

        video.on('next', playlistDownload);

      }
  }
}

module.exports = DownloadController
