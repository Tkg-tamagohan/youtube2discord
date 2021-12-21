// Copyright (c) 2021 Tkg (twitter/tkgtamagohan)
// This software is released under the MIT License, see LICENSE.

// channel id & namae
const channels ={
  'CHANNEL_ID_1': 'CHANNEL_NAME_1',
  'CHANNEL_ID_2': 'CHANNEL_NAME_2',
  'CHANNEL_ID_3': 'CHANNEL_NAME_3',
}

// youtube RSS URL
var url_pre = "https://www.youtube.com/feeds/videos.xml?channel_id="

const ns_yt = XmlService.getNamespace('yt', 'http://www.youtube.com/xml/schemas/2015')
const ns_media = XmlService.getNamespace('media', 'http://search.yahoo.com/mrss/')
const atom = XmlService.getNamespace('http://www.w3.org/2005/Atom')

// You must activate Day.js on GAS
const now = dayjs.dayjs()
const minute = now.minute()

const sheetId = 'SPREAD_SHEET_ID'
const spreadsheet = SpreadsheetApp.openById(sheetId)
const labels =[['title', 'published', 'updated', 'videoId', 'channel', 'live', 'scheduledStartTime']]

// text for Discord
function description_text(lbc, time = now.format('YYYY/MM/DD HH:mm:ss')){
  if(lbc == 'upcoming'){
    
    return time+'から配信予定！'

  } else if(lbc == 'live'){

    return time+'から配信中！'

  } else if(lbc == 'none'){
    return 'アーカイブはこちら'


  } else if(lbc == 'video'){
    return '動画が投稿されました'
  } else {
    return 'new content!'

  }
}

// post to discord
function post2discord(data){
  const type = 'application/json'
  const discord = 'YOUR_DISCORD_CHANNEL_WEBHOOK'
  const youtube_url = 'https://www.youtube.com/watch?v='

  var message = {
    username: data.channel,
    content: "",
    tts: false,
    embeds: [
      {
        type: "rich",
        title: data.title,
        description: data.description_text,
        color: 0xFF0000,
        image: {
          url: "https://img.youtube.com/vi/"+data.videoId+"/maxresdefault.jpg",
        },
        url: youtube_url+data.videoId,
        footer:{
          text: data.time
        },
      },

    ],
  }

  var options = {
    'method' : 'post',
    'contentType': type,
    'payload': JSON.stringify(message),
  }

  // console.log(JSON.stringify(data))

  try{
    UrlFetchApp.fetch(discord, options)
  }catch(e){
    console.log(e)
  }

  
}

// ALL data sheet
function mergeSheet(){
  console.log('mergeSheet')
  const main_sheet = set_sheet('main')
  const query_sheet = Object.values(channels).map((val)=>{
    return 'QUERY(\''+escape_html(val)+'\'!A:G, "select * offset 1", 0)'
  }).join(';')

  main_sheet.getRange(2,1).setValue('=QUERY({'+query_sheet+'}, "where Col1 is not null order by Col3 desc", 0)')

}



// sheet name escape
function escape_html(string) {
  if(typeof string !== 'string') {
    return string;
  }
  return string.replace(/[&'`"<>]/g, function(match) {
    return {
      '&': '&amp;',
      "'": '&#x27;',
      '`': '&#x60;',
      '"': '&quot;',
      '<': '&lt;',
      '>': '&gt;',
    }[match]
  });
}

// Auto sheet insert
function set_sheet(name){
  var sheet = spreadsheet.getSheetByName(escape_html(name))
  if(sheet)
    return sheet

  
  sheet=spreadsheet.insertSheet();
  sheet.setName(escape_html(name));
  sheet.getRange(1, 1, 1, labels.flat().length).setValues(labels)
  return sheet;
}

// Repositioning sheets
function sheet_move(){
  Object.values(channels).forEach((c, index)=>{
    set_sheet(c).activate()
    spreadsheet.moveActiveSheet(index+2)
  })
}

// find same videoId column
function findId(sheet, id, lastRow, updated){

  var ids
  var liveBroadcastContent = ''
  var scheduledStartTime = false
  var actualStartTime = false
  var video_info = {
    snippet:{
      liveBroadcastContent: ''
    },
    liveStreamingDetails:{
      scheduledStartTime:updated,
      actualStartTime:updated,
    }
  }

  try{
    ids = sheet.getRange(1, 4, lastRow).getValues()
  } catch {
    ids = sheet.getRange(1, 4).getValues()
  }
  var index = ids.flat().indexOf(id)

  if(index == -1){
    try{
      video_info = YT.Videos.list('snippet, liveStreamingDetails', {id:id, fields:'items(snippet(liveBroadcastContent), liveStreamingDetails(scheduledStartTime, actualStartTime))'}).items[0]

      liveBroadcastContent = 'liveStreamingDetails' in video_info ? video_info.snippet.liveBroadcastContent: 'video'
      
      scheduledStartTime = Object.keys(video_info).indexOf('liveStreamingDetails') >= 0 ? video_info.liveStreamingDetails.scheduledStartTime : false

      actualStartTime = scheduledStartTime && Object.keys(video_info.liveStreamingDetails).indexOf('actualStartTime') >= 0 ? video_info.liveStreamingDetails.actualStartTime : false
      
      return [true, liveBroadcastContent, scheduledStartTime, actualStartTime]
    } catch(e){
      console.log(e)
    }
  } else {

  }
  return [false, liveBroadcastContent, scheduledStartTime, actualStartTime]
    
}

// store new content
function storage(id) {

  let return_info = false

  var channel = channels[id]
  console.log('storage: '+channel)
  sheet = set_sheet(channel)

  var url = url_pre+id
  var xml = UrlFetchApp.fetch(url).getContentText()
  var docs = XmlService.parse(xml)
  var root = docs.getRootElement()
  var items = root.getChildren('entry', atom).slice(0,5)

  for(let i = 0; i < items.length; i++){
    var lastRow = sheet.getLastRow()

    var title = items[i].getChildText('title', atom)
    var updated = dayjs.dayjs(items[i].getChildText('updated', atom))
    var published = dayjs.dayjs(items[i].getChildText('published', atom))
    var videoId = items[i].getChildText('videoId', ns_yt)

    var tmp = findId(sheet, videoId, lastRow, updated.format('YYYY/MM/DDTHH:mm:ss'))
    var tf = tmp[0]
    return_info = tf || return_info
    var live = tmp[1]
    var sst = tmp[2]
    var ast = tmp[3]  
    
    if(tf){
      console.log('store: '+title)
      sheet.getRange(lastRow+1, 1).setValue(title)
      sheet.getRange(lastRow+1, 2).setValue(published.format('YYYY/MM/DDTHH:mm:ss'))
      sheet.getRange(lastRow+1, 3).setValue(updated.format('YYYY/MM/DDTHH:mm:ss'))
      sheet.getRange(lastRow+1, 4).setValue(videoId)
      sheet.getRange(lastRow+1, 5).setValue(channel)
      sheet.getRange(lastRow+1, 6).setValue(live)

      if(sst != false){
        sheet.getRange(lastRow+1, 7).setValue(dayjs.dayjs(sst).format('YYYY/MM/DDTHH:mm:ss'))
      }

          post2discord({channel:channel, title:title, videoId:videoId, time: now.format('YYYY/MM/DDTHH:mm:ss'), description_text:description_text(live, (ast != false ? dayjs.dayjs(ast).format('HH:mm'):dayjs.dayjs(sst).format('MM/DD HH:mm')))})
    }
  }
  return return_info

}

// store trigger
function store(){

  var update = false

  Object.keys(channels).forEach((id)=>{
    update = storage(id) || update
  })
  if (update){
    mergeSheet()
  }
  console.log('completed!')
  
}

// update
function update(title, lbc, sst, videoId, channel){
  const sheet = set_sheet(channel)
  const lr = sheet.getLastRow()
  const tmp = sheet.getRange(1, 4, lr).getValues().findIndex((id) => id == videoId)+1
  sheet.getRange(tmp, 1).setValue(title)
  sheet.getRange(tmp, 6).setValue(lbc)
  sheet.getRange(tmp, 7).setValue(sst.format('YYYY/MM/DD HH:mm:ss'))
}

// video info update check
function updateChecker(data){
  var videoIds = data.map((v)=>{
    return v[3]
  }).join(',')
  
  var video_info = YT.Videos.list('snippet, liveStreamingDetails', {id:videoIds, fields:'items(snippet(liveBroadcastContent, title), liveStreamingDetails(scheduledStartTime, actualStartTime))'}).items

  video_info.forEach((v, index)=>{
    const videoId = data[index][3]
    const current_title = data[index][0]
    const current_lbc = data[index][5]
    const current_sst = dayjs.dayjs(data[index][6])
    // const channelId = Object.keys(channels)[Object.values(channels).findIndex((c)=> c == data[index][4])]
    const channel = data[index][4]

    const title = v.snippet.title
    const lbc = v.snippet.liveBroadcastContent
    const sst = dayjs.dayjs(v.liveStreamingDetails.scheduledStartTime)
    const ast = Object.keys(v.liveStreamingDetails).indexOf('actualStartTime') >= 0 ? dayjs.dayjs(v.liveStreamingDetails.actualStartTime) : false

    if(current_title != title || current_lbc != lbc || current_sst.format() != sst.format()){
      console.log('update: ' +title)
      console.log(current_lbc+' => '+lbc)
      var tmp_time = ast ? ast : sst
      update(title, lbc, sst, videoId, channel)
      tmp_time = ast ? ast.format('HH:mm') : sst.format('MM/DD HH:mm')
      var txt = description_text(lbc, tmp_time) 
      
      post2discord({channel:channel, title:title, videoId:videoId, time: now.format('YYYY/MM/DD HH:mm:ss'), 'description_text':txt})
      Utilities.sleep(400)


    }

  })


}

// update trigger
function query(){
  const query = set_sheet('query').clear()

  query.getRange(1,1).setValue('=QUERY(main!A:G, "where F = \'upcoming\'", 1)')
  var upcoming = query.getDataRange().getValues()
  upcoming.shift()

  query.getRange(1,1).setValue('=QUERY(main!A:G, "where F = \'live\'", 1)')
  var live = query.getDataRange().getValues()
  live.shift()

  var check_videos = upcoming.concat(live)

  updateChecker(check_videos)
}

// Notification POST
function post(video, situation){
  var sst = dayjs.dayjs(video[6])

  if(situation == 'upcoming' && ((sst.diff(now, 'hour') <= 3 && minute%15 == 0) || (sst.diff(now, 'hour')%6 == 0 && minute == 0 && sst.diff(now, 'day') < 7))){
    post2discord({channel:video[4], title:video[0], videoId:video[3], time: now.format('YYYY/MM/DD HH:mm:ss'), 'description_text':description_text(situation, sst.format('MM/DD HH:mm'))})
    console.log(video[0])
    Utilities.sleep(400)
  } else if(situation == 'live' && minute%10 == 0){
    post2discord({channel:video[4], title:video[0], videoId:video[3], time: now.format('YYYY/MM/DD HH:mm:ss'), 'description_text':description_text(situation, sst.format('HH:mm'))})
    console.log(video[0])
    Utilities.sleep(400)
  }
  
}

// Notification trigger
function notification(){
  const query = set_sheet('query').clear()
  
  query.getRange(1,1).setValue('=QUERY(main!A:G, "where F = \'upcoming\'", 1)')
  var upcoming = query.getDataRange().getValues()
  upcoming.shift()
  upcoming.forEach((video)=>{post(video, 'upcoming')})

  query.getRange(1,1).setValue('=QUERY(main!A:G, "where F = \'live\'", 1)')
  var live = query.getDataRange().getValues()
  live.shift()
  live.forEach((video)=>{post(video, 'live')})

}
