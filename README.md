# LINE 房源搜尋器

手機、電腦共用的響應式房源搜尋工具。可讓 LINE Official Account Bot 收集「加入群組後」的新文字訊息，依群組保存，再用地區、租金、房型、電梯、子母車、車位、租補、寵物等條件篩選。

## LINE 限制
Messaging API 無法任意讀取群組過去全部歷史訊息，也沒有讀取 LINE 群組記事本的公開端點。因此：
- Bot 加入後的新訊息：自動收集
- 舊訊息 / 記事本：複製文字後從「匯入舊資料」貼上匯入

## 啟動
1. 安裝 Node.js 20+
2. 複製 `.env.example` 為 `.env`
3. 填入 LINE Channel Access Token / Channel Secret
4. 執行：
   npm install
   npm start
5. 開啟 http://localhost:3000

## LINE Developers 設定
1. 建立 Messaging API channel
2. 開啟 Allow bot to join group chats
3. 將 Bot 加入房源群組
4. Webhook URL 設成 `https://你的公開網域/webhook`
5. 啟用 webhook

## 現有功能
- 多群組分開儲存
- 指定單一群組搜尋或全部群組搜尋
- 自動解析：地區、路名、租金、房型
- 自動解析：電梯、子母車/垃圾集中、汽機車位、租補、可寵/貓/狗、開伙、陽台、獨洗、獨曬
- 舊記事本 / 聊天文字手動匯入
- SQLite 本機資料庫
- 手機 / 電腦響應式 UI

## 下一版可擴充
- OpenAI/LLM 房源文字結構化，提升各種仲介縮寫辨識
- 圖片 OCR / 圖片房源辨識
- 地址距離搜尋（SOGO、中國醫、捷運站周邊）
- 收藏、已出租、帶看狀態、客戶需求配對
- LIFF，直接嵌在 LINE 裡開啟搜尋介面
