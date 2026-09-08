import 'dotenv/config';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import * as line from '@line/bot-sdk';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const app = express();const port = process.env.PORT || 3000;
const db = new DatabaseSync(path.join(__dirname, 'data', 'houses.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS groups (
  group_id TEXT PRIMARY KEY,
  group_name TEXT,
  picture_url TEXT,
  last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL,
  source_type TEXT DEFAULT 'message',
  message_id TEXT,
  sender_id TEXT,
  raw_text TEXT NOT NULL,
  district TEXT,
  road TEXT,
  rent INTEGER,
  room_type TEXT,
  elevator INTEGER DEFAULT 0,
  trash_service INTEGER DEFAULT 0,
  car_parking INTEGER DEFAULT 0,
  scooter_parking INTEGER DEFAULT 0,
  pet INTEGER DEFAULT 0,
  cat INTEGER DEFAULT 0,
  dog INTEGER DEFAULT 0,
  subsidy INTEGER DEFAULT 0,
  cooking INTEGER DEFAULT 0,
  balcony INTEGER DEFAULT 0,
  washer INTEGER DEFAULT 0,
  dryer_area INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_listing_group ON listings(group_id);
CREATE INDEX IF NOT EXISTS idx_listing_rent ON listings(rent);
`);

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
};
const client = config.channelAccessToken ? new line.messagingApi.MessagingApiClient({channelAccessToken: config.channelAccessToken}) : null;

function hasAny(text, words) { return words.some(w => text.includes(w)); }
function parseListing(raw) {
  const t = String(raw || '').replace(/,/g, '').replace(/\s+/g, ' ').trim();
  const rentMatch = t.match(/(?:租金|月租|租|\$)?\s*(\d{4,6})\s*(?:元|\/月)?/i);
  const districts = ['中區','東區','南區','西區','北區','北屯','西屯','南屯','太平','大里','烏日','潭子','豐原','沙鹿','龍井','大雅'];
  const district = districts.find(d => t.includes(d)) || '';
  const roadMatch = t.match(/([\u4e00-\u9fff]{2,8}(?:路|街|巷|大道))/);
  let roomType = '';
  if (/套房/.test(t)) roomType = '套房';
  else if (/1房|一房/.test(t)) roomType = '1房';
  else if (/2房|兩房|二房/.test(t)) roomType = '2房';
  else if (/3房|三房/.test(t)) roomType = '3房';
  else if (/4房|四房/.test(t)) roomType = '4房';

  return {
    district,
    road: roadMatch?.[1] || '',
    rent: rentMatch ? Number(rentMatch[1]) : null,
    room_type: roomType,
    elevator: hasAny(t,['電梯','有梯']) ? 1 : 0,
    trash_service: hasAny(t,['子母車','垃圾集中','垃圾代收','垃圾處理']) ? 1 : 0,
    car_parking: hasAny(t,['汽車位','平面車位','機械車位','車位']) ? 1 : 0,
    scooter_parking: hasAny(t,['機車位','機車停車']) ? 1 : 0,
    pet: hasAny(t,['可寵','寵物可','可養寵']) ? 1 : 0,
    cat: hasAny(t,['可貓','貓可','可養貓']) ? 1 : 0,
    dog: hasAny(t,['可狗','狗可','可養狗']) ? 1 : 0,
    subsidy: hasAny(t,['租補','可補助','租屋補助']) && !hasAny(t,['不可租補','禁租補']) ? 1 : 0,
    cooking: hasAny(t,['可開伙','可煮','開伙']) && !hasAny(t,['不可開伙','禁開伙']) ? 1 : 0,
    balcony: hasAny(t,['陽台','獨立陽台']) ? 1 : 0,
    washer: hasAny(t,['獨洗','洗衣機']) ? 1 : 0,
    dryer_area: hasAny(t,['獨曬','曬衣']) ? 1 : 0
  };
}

const insertListing = db.prepare(`
INSERT OR IGNORE INTO listings (
 group_id, source_type, message_id, sender_id, raw_text, district, road, rent, room_type,
 elevator, trash_service, car_parking, scooter_parking, pet, cat, dog, subsidy, cooking, balcony, washer, dryer_area
) VALUES (
 @group_id, @source_type, @message_id, @sender_id, @raw_text, @district, @road, @rent, @room_type,
 @elevator, @trash_service, @car_parking, @scooter_parking, @pet, @cat, @dog, @subsidy, @cooking, @balcony, @washer, @dryer_area
)`);

async function saveGroup(groupId) {
  let name = groupId, pictureUrl = '';
  if (client) {
    try {
      const s = await client.getGroupSummary(groupId);
      name = s.groupName || groupId;
      pictureUrl = s.pictureUrl || '';
    } catch {}
  }
  db.prepare(`INSERT INTO groups(group_id,group_name,picture_url,last_seen_at)
    VALUES(?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(group_id) DO UPDATE SET group_name=excluded.group_name,picture_url=excluded.picture_url,last_seen_at=CURRENT_TIMESTAMP`)
    .run(groupId,name,pictureUrl);
}

app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});
if (config.channelSecret && config.channelAccessToken) {
  app.post('/webhook', line.middleware(config), async (req,res) => {
    try {
      for (const event of req.body.events || []) {
        if (event.source?.type !== 'group') continue;

        const groupId = event.source.groupId;
        await saveGroup(groupId);

        if (event.type === 'message' && event.message?.type === 'text') {
          const parsed = parseListing(event.message.text);

          insertListing.run({
            group_id: groupId,
            source_type: 'message',
            message_id: event.message.id,
            sender_id: event.source.userId || '',
            raw_text: event.message.text,
            ...parsed
          });
        }
      }

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false });
    }
  });
}
app.use(express.json({limit:'2mb'}));
app.use(express.static(path.join(__dirname,'public')));

app.get('/api/groups', (req,res) => {
  res.json(db.prepare('SELECT * FROM groups ORDER BY last_seen_at DESC').all());
});

app.post('/api/groups/manual', (req,res) => {
  const {groupName} = req.body;
  if (!groupName?.trim()) return res.status(400).json({error:'請輸入群組名稱'});
  const groupId = 'manual:' + Date.now();
  db.prepare('INSERT INTO groups(group_id,group_name) VALUES(?,?)').run(groupId,groupName.trim());
  res.json({group_id:groupId, group_name:groupName.trim()});
});

app.post('/api/import', (req,res) => {
  const {groupId, text, sourceType='import'} = req.body;
  if (!groupId || !text?.trim()) return res.status(400).json({error:'缺少群組或內容'});
  const blocks = text.split(/\n\s*\n|(?=\n(?:房源|物件|地址)[:：])/).map(s=>s.trim()).filter(Boolean);
  let count = 0;
  for (const block of blocks) {
    const parsed = parseListing(block);
    const info = insertListing.run({
      group_id:groupId, source_type:sourceType, message_id:'import-'+Date.now()+'-'+count+'-'+Math.random(), sender_id:'', raw_text:block, ...parsed
    });
    if (info.changes) count++;
  }
  res.json({ok:true,count});
});

app.get('/api/search', (req,res) => {
  const q = req.query;
  const where = ['1=1']; const p = {};
  if (q.groupId) { where.push('group_id=@groupId'); p.groupId=q.groupId; }
  if (q.district) { where.push('district=@district'); p.district=q.district; }
  if (q.roomType) { where.push('room_type=@roomType'); p.roomType=q.roomType; }
  if (q.minRent) { where.push('rent>=@minRent'); p.minRent=Number(q.minRent); }
  if (q.maxRent) { where.push('rent<=@maxRent'); p.maxRent=Number(q.maxRent); }
  const flags=['elevator','trash_service','car_parking','scooter_parking','pet','cat','dog','subsidy','cooking','balcony','washer','dryer_area'];
  for (const f of flags) if (q[f]==='1') where.push(`${f}=1`);
  if (q.keyword) { where.push('raw_text LIKE @kw'); p.kw=`%${q.keyword}%`; }
  const rows = db.prepare(`SELECT l.*, g.group_name FROM listings l LEFT JOIN groups g ON g.group_id=l.group_id WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 200`).all(p);
  res.json(rows);
});

app.get('/api/stats', (req,res)=>{
  res.json({groups:db.prepare('SELECT COUNT(*) c FROM groups').get().c,listings:db.prepare('SELECT COUNT(*) c FROM listings').get().c});
});

app.get('/*splat', (req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`LINE 房源搜尋器：http://localhost:${port}`);
});

server.on('error', (err) => {
  console.error('HTTP Server Error:', err);
});

server.on('close', () => {
  console.log('HTTP Server 已關閉');
});

server.ref();
