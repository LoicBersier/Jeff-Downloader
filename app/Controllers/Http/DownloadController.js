'use strict'
const youtubedl = require('youtube-dl');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { version } = require('../../../package.json');
const Antl = use('Antl');
const proxy = require('../../../proxy/proxy.json');
const fetch = require('node-fetch');

let viewCounter = 0;
let files = [];
let day;
let month;
let announcementArray = [];
let announcement;
let defaultViewOption = { version: version, viewCounter: viewCounter, file: files, day: day, month: month, announcement: announcement, proxy: proxy }


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
    defaultViewOption.viewCounter = viewCounter;

    for (let i = 0; Antl.forLocale(locale)._messages.fr.announcement.length > i; i++) {
      announcementArray.push(Antl.forLocale(locale).formatMessage(`announcement.${i + 1}`));
    }

    // Get random announcement
    defaultViewOption.announcement = announcementArray[Math.floor(Math.random() * announcementArray.length)];

    // Get date for some event
    let today = new Date();
    defaultViewOption.day = today.getDay();
    defaultViewOption.month = today.getMonth();
    // If legacy link return
    if (request.url() == '/legacy') return view.render('legacy', defaultViewOption);

    files = [];
    let file = [];
    for (let f of fs.readdirSync('./public/uploads')) {
      if (f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mp3') || f.endsWith('.flac'))
        file.push(f)
    }
    // get the 5 most recent files
    file = file.sort((a, b) => {
      if ((a || b).endsWith('.mp4') || (a || b).endsWith('.webm') || (a || b).endsWith('.mp3') || (a || b).endsWith('.flac')) {
        let time1 = fs.statSync(`./public/uploads/${b}`).ctime;
        let time2 = fs.statSync(`./public/uploads/${a}`).ctime;
        if (time1 < time2) return -1;
        if (time1 > time2) return 1;
      }
      return 0;
    }).slice(0, 5)

    // Save space by deleting file that doesn't appear in the recent feed
    for (let f of fs.readdirSync('./public/uploads')) {
      if (!file.includes(f) && (f != 'hidden' && f != '.keep')) {
        if (fs.existsSync(`./public/uploads/${f}`))
          fs.unlinkSync(`./public/uploads/${f}`);

        if (fs.existsSync(`./public/thumbnail/${f}`))
          fs.unlinkSync(`./public/thumbnail/${f}`);

        if (fs.existsSync(`./public/thumbnail/${f}.png`))
          fs.unlinkSync(`./public/thumbnail/${f}.png`);
      }
    }

    for (let f of file) {
      let fileInfo = formatBytes(fs.statSync(`./public/uploads/${f}`).size).split(' ');
      let defaultFiles = { name: f.replace(path.extname(f), ''), size: fileInfo[0], unit: fileInfo[1], date: fs.statSync(`./public/uploads/${f}`).ctime, location: `uploads/${f}`, ext: path.extname(f), thumbnail: `/thumbnail/${f}`, img: `/thumbnail/${f.replace(path.extname(f), '.png')}` };

      if (f.endsWith('.mp3') || f.endsWith('.flac')) {
        defaultFiles.thumbnail = `./thumbnail/${f.replace(path.extname(f), '.png')}`
      }
      files.push(defaultFiles);
    }
    defaultViewOption.file = files;
		return view.render('index', defaultViewOption);
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
        feed: request.input('feed'),
        proxy: request.input('proxy'),
        sponsorBlock : request.input('sponsorBlock')
      }

      if (!data.url) {
        let viewOption = {...defaultViewOption};
        viewOption.error = true;
        viewOption.errormsg = 'bruh moment, you didin\'t input a link.';
        return view.render(page, viewOption);
      }

      let videoID;
      if (data.sponsorBlock) {
        let regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
        let match = data.url.match(regExp);
        videoID = (match&&match[7].length==11)? match[7] : false;
        if (!videoID) {
          let viewOption = {...defaultViewOption};
          viewOption.error = true;
          viewOption.errormsg = 'To use sponsorBlock you need a valid youtube link!';
          return view.render(page, viewOption);
        }
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

        let options = ['--format=mp4', '-o', altFolder];
        if (data.proxy !== "none") {
          options.push('--proxy');
          options.push(data.proxy);
        }

        return youtubedl.exec(data.url, options, {}, function(err, output) {
          if (err) {
            let viewOption = {...defaultViewOption};
            viewOption.error = true;
            viewOption.errormsg = err;
            return response.send(view.render(page, viewOption))
          }

          return response.attachment(altFolder);
        });
      } else {
        // Download as mp4 if possible
        let options = ['--format=mp4', '-f', option];
        if (data.proxy !== "none") {
          options.push('--proxy');
          options.push(data.proxy);
        }

        let video = youtubedl(data.url, options);

        video.on('error', function(err) {
          console.error(err);
          let viewOption = {...defaultViewOption};
          viewOption.error = true;
          viewOption.errormsg = err;

          return response.send(view.render(page, viewOption))
        });

        let ext;
        video.on('info', function(info) {
          // Set file name
          ext = info.ext;
          let title = info.title.slice(0,50);
          DLFile = `${title.replace(/\s/g, '')}.${ext}`;
          DLFile = DLFile.replace(/[()]|[/]|[\\]|[!]|[?]/g, '');
          DLFile = DLFile.replace(',', '');

          // If no title use the ID
          if (title == '_') title = `_${info.id}`;
          // If user want to hide from the feed
          if (data.feed == 'on')
            DLFile = `hidden/${title}.${ext}`;

          if (data.sponsorBlock) video.pipe(fs.createWriteStream(`./public/uploads/hidden/${DLFile}`));
          else video.pipe(fs.createWriteStream(`./public/uploads/${DLFile}`));
        });

        video.on('end', function() {
          if (data.format == 'mp4' || data.format == 'webm') {
            if (data.sponsorBlock) { // WARNING: THIS PART SUCK
              let filter = '';
              let abc = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z'];
              fetch(`https://sponsor.ajay.app/api/skipSegments?videoID=${videoID}?categories=["sponsor","music_offtopic"]`)
                .then(res => {
                  if (res.status === 404) {
                    let viewOption = {...defaultViewOption};
                    viewOption.error = true;
                    viewOption.errormsg = 'Couldn\'t find any SponsorBlock data for this video.';

                    return response.send(view.render(page, viewOption));
                  }
                  return res.json()
                })
                .then(json => {
                  if (json === undefined) return;
                  let i = 0;
                  let previousEnd;
                  let usedLetter = [];
                  json.forEach(sponsor => {
                    usedLetter.push(abc[i]);
                    if (i === 0) {
                      filter += `[0:v]trim=start=0:end=${sponsor.segment[0]},setpts=PTS-STARTPTS[${abc[i]}v];`;
                      filter += `[0:a]atrim=start=0:end=${sponsor.segment[0]},asetpts=PTS-STARTPTS[${abc[i]}a];`;
                    } else {
                      filter += `[0:v]trim=start=${previousEnd}:end=${sponsor.segment[0]},setpts=PTS-STARTPTS[${abc[i]}v];`;
                      filter += `[0:a]atrim=start=${previousEnd}:end=${sponsor.segment[0]},asetpts=PTS-STARTPTS[${abc[i]}a];`;
                    }
                    previousEnd = sponsor.segment[1];
                    i++;
                  });
                  usedLetter.push(abc[i]);
                  filter += `[0:v]trim=start=${previousEnd},setpts=PTS-STARTPTS[${abc[i]}v];`;
                  filter += `[0:a]atrim=start=${previousEnd},asetpts=PTS-STARTPTS[${abc[i]}a];`;
                  let video = '';
                  let audio = '';
                  usedLetter.forEach(letter => {
                    video += `[${letter}v]`
                    audio += `[${letter}a]`
                  });
                  filter += `${video}concat=n=${i + 1}[outv];`;
                  filter += `${audio}concat=n=${i + 1}:v=0:a=1[outa]`;

                  ffmpeg(`./public/uploads/hidden/${DLFile}`)
                    .inputFormat('mp4')
                    .complexFilter(filter)
                    .outputOptions('-map [outv]')
                    .outputOptions('-map [outa]')
                    .save(`./public/uploads/${DLFile}`)
                    .on('error', function(err, stdout, stderr) {
                      console.log('Cannot process video: ' + err.message);
                      let viewOption = {...defaultViewOption};
                      viewOption.error = true;
                      viewOption.errormsg = err.message;

                      return response.send(view.render(page, viewOption))
                    })
                    .on('end', () => {
                      console.log('end');
                      response.attachment(`./public/uploads/${DLFile}`)
                      generateThumbnail(DLFile);
                    });
                });
            } else {
              // If user requested mp4 directly attach the file
              response.attachment(`./public/uploads/${DLFile}`)
              generateThumbnail(DLFile);
            }
          } else {
            // If user requested an audio format, convert it
            ffmpeg(`./public/uploads/${DLFile}`)
              .noVideo()
              .audioChannels('2')
              .audioFrequency('44100')
              .audioBitrate('320k')
              .format(data.format)
              .save(`./public/uploads/${DLFile.replace(`.${ext}`, `.${data.format}`)}`)
              .on('error', function(err, stdout, stderr) {
                  console.log('Cannot process video: ' + err.message);
                  let viewOption = {...defaultViewOption};
                  viewOption.error = true;
                  viewOption.errormsg = err.message;

                  return response.send(view.render(page, viewOption))
              })
              .on('end', () => {
                fs.unlinkSync(`./public/uploads/${DLFile}`);
                generateWaveform(DLFile.replace(`.${ext}`, `.${data.format}`));
                return response.attachment(`./public/uploads/${DLFile.replace(`.${ext}`, `.${data.format}`)}`);
              });
          }
        });
      }
  }
}

module.exports = DownloadController

async function generateWaveform(f) {
  ffmpeg(`./public/uploads/${f}`)
    .complexFilter('[0:a]aformat=channel_layouts=mono,compand=gain=-6,showwavespic=s=600x120:colors=#9cf42f[fg];color=s=600x120:color=#44582c,drawgrid=width=iw/10:height=ih/5:color=#9cf42f@0.1[bg];[bg][fg]overlay=format=rgb,drawbox=x=(iw-w)/2:y=(ih-h)/2:w=iw:h=1:color=#9cf42f')
    .frames(1)
    .noVideo()
    .noAudio()
    .duration(0.1)
    .on('error', function(err, stdout, stderr) {
      return console.log('Cannot process video: ' + err.message);
    })
    .on('end', () => {
      generateThumbnail(`../thumbnail/${f.replace(path.extname(f), '.mp4')}`);
    })
    .save(`./public/thumbnail/${f.replace(path.extname(f), '.mp4')}`);
}

async function generateThumbnail(f) {
  ffmpeg(`./public/uploads/${f}`)
    .screenshots({
      timestamps: ['20%'],
      size: '720x480',
      folder: './public/thumbnail/',
      filename: f.replace(path.extname(f), '.png')
    })
    .on('error', function(err, stdout, stderr) {
      return console.log('Cannot process video: ' + err.message);
    });

  if (!fs.existsSync(`./public/thumbnail/tmp/${f}`) && !f.startsWith('../thumbnail'))
    fs.mkdirSync(`./public/thumbnail/tmp/${f}`)

  ffmpeg(`./public/uploads/${f}`)
    .complexFilter('select=gt(scene\\,0.8)')
    .frames(10)
    .complexFilter('fps=fps=1/10')
    .save(`./public/thumbnail/tmp/${f}/%03d.png`)
    .on('error', function(err, stdout, stderr) {
      return console.log('Cannot process video: ' + err.message);
    })
    .on('end', () => {
      ffmpeg(`./public/thumbnail/tmp/${f}/%03d.png`)
        .complexFilter('zoompan=d=(.5+.5)/.5:s=640x480:fps=1/.5,framerate=25:interp_start=0:interp_end=255:scene=100')
        .format('mp4')
        .save(`./public/thumbnail/${f}`)
        .on('error', function(err, stdout, stderr) {
          return console.log('Cannot process video: ' + err.message);
        })
        .on('end', () => {
          // Save space by deleting tmp directory
          for (let files of fs.readdirSync(`./public/thumbnail/tmp/${f}`)) {
            if (files == '.keep') return;
            fs.unlinkSync(`./public/thumbnail/tmp/${f}/${files}`);
          }
          fs.rmdirSync(`./public/thumbnail/tmp/${f}`);
        });
    });
}
