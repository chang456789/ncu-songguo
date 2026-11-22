# 負責任的 AI｜Responsible AI

松果用 AI 幫中央大學同學更快找到公車、活動、美食和校園資訊。我們希望 AI 有用，也希望你用得安心。這一頁說明松果的 AI 怎麼處理你的資料、怎麼避免有害內容，以及出錯時怎麼回報。

Songguo uses AI to help NCU students find buses, events, food and campus information faster. We want the AI to be useful, and we want you to feel safe using it. This page explains how Songguo's AI handles your data, how we keep harmful content out, and how to report a problem.

---

## 1. 我們不儲存你的對話｜We don't store your conversations

- 你問「問松果」的問題和 AI 的回答，只留在你這個瀏覽器分頁裡。關掉或重新整理頁面就會消失，松果的伺服器和資料庫都不會保存。
- 為了讓 AI 回答，你的問題和必要的網站資料（例如下一班公車、近期活動，以及你的下一堂課）會送到 AI 服務產生回答；這些資料只用在這一次回答。
- 松果只記錄「用了哪個 AI 功能、花了多久、有沒有成功」這類使用統計，**不記錄你問了什麼、AI 回了什麼**。
- 松果使用匿名登入，不需要帳號、學號、Email 或手機。

<!-- -->

- Your questions to "Ask Songguo" and the AI's answers stay only in your browser tab. They disappear when you close or reload the page; Songguo's servers and database do not keep them.
- To answer you, your question and the site data it needs (such as the next bus, upcoming events and your next class) are sent to the AI service. This data is used only for that one answer.
- Songguo logs only usage statistics such as which AI feature was used, how long it took and whether it succeeded. **We never log what you asked or what the AI replied.**
- Songguo uses anonymous sign-in. No account, student ID, email or phone number is needed.

## 2. 內容安全過濾｜Content safety filtering

- 松果的 AI 透過 **Azure OpenAI** 提供，每一次 AI 請求和回答都會經過 **Azure AI 內容安全過濾**，自動擋下仇恨、色情、暴力、自我傷害等有害內容。
- 即時大廳和留言送出前，松果會先用規則檢查詐騙連結、短網址、洗版和辱罵字詞；只有規則判斷不出來、又含有連結的訊息，才請 AI 判斷是否為詐騙或釣魚。
- 寧可放行也不誤擋：沒有明顯惡意的正常聊天不會被擋。

<!-- -->

- Songguo's AI is provided through **Azure OpenAI**. Every AI request and answer passes through **Azure AI Content Safety filtering**, which automatically blocks hateful, sexual, violent and self-harm content.
- Before a lobby message or comment is sent, Songguo checks it with rules for scam links, short URLs, spam and abusive words. Only messages that contain a link the rules can't judge are sent to the AI to check for scams or phishing.
- We would rather let a message through than block it by mistake: normal chat with no clear harm is never blocked.

## 3. 發文前隱私提醒｜Privacy reminder before you post

- 發文（論壇、二手市集、租屋）、開拼車團或留言時，如果內容裡有手機號碼、LINE ID、門牌地址、Email、身分證字號或銀行帳號，松果會先提醒你。
- 你可以一鍵改成「校內集合點」和「私訊再交換」，也可以照原內容發布。我們只提醒，不替你決定。
- 這個檢查完全在你的瀏覽器裡用規則完成，不會把內容送給 AI。

<!-- -->

- When you post (forum, second-hand market, housing), start a ride share or leave a comment, Songguo reminds you if your text contains a phone number, LINE ID, street address, email, national ID number or bank account.
- With one tap you can switch to a campus meeting point and "exchange details by private message", or post as written. We remind you; we don't decide for you.
- This check runs entirely in your browser with rules. Your text is not sent to the AI.

## 4. AI 可能出錯，請以官方資訊為準｜AI can make mistakes, so check official sources

- AI 只根據松果網站上的資料回答公車、活動、店家等即時資訊；網站沒有的資料，它會說不知道，不會編造。
- 但 AI 仍然可能理解錯誤或整理錯誤，而且公車班次、活動時間可能臨時變動。
- **搭車、報名活動、繳費、選課等重要事情，請以桃園市公車動態、學校公告和各單位官網為準。**
- 讀書方法、穿搭等一般建議是 AI 依一般知識提供的參考，不是專業意見。

<!-- -->

- For live information such as buses, events and shops, the AI answers only from the data on the Songguo site. If the site doesn't have the data, it says so instead of making something up.
- The AI can still misunderstand or summarize incorrectly, and bus times and events can change at short notice.
- **For anything important, such as catching a bus, registering for an event, paying fees or choosing courses, rely on Taoyuan's official bus information, university announcements and official department websites.**
- General advice, such as study tips or what to wear, is based on general knowledge. It is a suggestion, not professional advice.

## 5. 如何回報問題｜How to report a problem

- **AI 回答錯誤或不恰當**：到 GitHub 回報 <https://github.com/chang456789/ncu-songguo/issues>，寫下你問的問題、AI 的回答和時間。請不要貼上手機、地址等個人資料。
- **不當貼文**：按貼文下方的「檢舉」。同一篇被 3 位不同同學檢舉後會自動暫時隱藏，等管理員審核。
- 我們會依回報修正 AI 的規則，並重新測試回答品質。

<!-- -->

- **A wrong or inappropriate AI answer**: report it on GitHub at <https://github.com/chang456789/ncu-songguo/issues>. Include your question, the AI's answer and the time. Please don't include personal details such as phone numbers or addresses.
- **An inappropriate post**: tap "Report" under the post. A post reported by 3 different students is hidden automatically until a moderator reviews it.
- We use reports to improve the AI's rules and then re-test the quality of its answers.
