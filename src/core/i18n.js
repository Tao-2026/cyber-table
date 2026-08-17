const messages = {
  en: { tagline: "Party games for every screen", create: "CREATE ROOM", join: "JOIN ROOM", practice: "PRACTICE VS COMPUTER", practiceNote: "Offline practice · No party points", practiceTitle: "Practice", you: "You", computer: "Computer", yourTurn: "YOUR TURN — choose a square", computerTurn: "COMPUTER TURN", win: "YOU WIN!", lose: "COMPUTER WINS", draw: "DRAW — good game!", restart: "PLAY AGAIN", home: "BACK HOME", onlineSoon: "Online rooms are coming in the next local milestone." },
  zh: { tagline: "每个屏幕都能加入的聚会桌游", create: "创建房间", join: "加入房间", practice: "与电脑练习", practiceNote: "离线练习 · 不计聚会积分", practiceTitle: "单人练习", you: "你", computer: "电脑", yourTurn: "轮到你了——请选择格子", computerTurn: "电脑正在行动", win: "你赢了！", lose: "电脑获胜", draw: "平局——精彩对局！", restart: "再玩一局", home: "返回首页", onlineSoon: "在线房间将在下一个本地里程碑实现。" }
};

export function getLanguage() {
  return localStorage.getItem("cyberArcade.language") || localStorage.getItem("cyberTable.language") || "en";
}
export function setLanguage(language) {
  localStorage.setItem("cyberArcade.language", language);
}
export function t(language, key) { return messages[language]?.[key] ?? messages.en[key] ?? key; }
