export const AVATARS = Object.freeze([
  { id: "robot", emoji: "🤖", label: { en: "Robot", zh: "机器人" } },
  { id: "panda", emoji: "🐼", label: { en: "Panda", zh: "熊猫" } },
  { id: "bunny", emoji: "🐰", label: { en: "Bunny", zh: "兔子" } },
  { id: "fox", emoji: "🦊", label: { en: "Fox", zh: "狐狸" } },
  { id: "tiger", emoji: "🐯", label: { en: "Tiger", zh: "老虎" } },
  { id: "frog", emoji: "🐸", label: { en: "Frog", zh: "青蛙" } },
  { id: "monkey", emoji: "🐵", label: { en: "Monkey", zh: "猴子" } },
  { id: "dog", emoji: "🐶", label: { en: "Dog", zh: "小狗" } },
  { id: "cat", emoji: "🐱", label: { en: "Cat", zh: "小猫" } },
  { id: "koala", emoji: "🐨", label: { en: "Koala", zh: "考拉" } },
  { id: "penguin", emoji: "🐧", label: { en: "Penguin", zh: "企鹅" } },
  { id: "unicorn", emoji: "🦄", label: { en: "Unicorn", zh: "独角兽" } },
  { id: "octopus", emoji: "🐙", label: { en: "Octopus", zh: "章鱼" } },
  { id: "lion", emoji: "🦁", label: { en: "Lion", zh: "狮子" } },
  { id: "bear", emoji: "🐻", label: { en: "Bear", zh: "小熊" } },
  { id: "hamster", emoji: "🐹", label: { en: "Hamster", zh: "仓鼠" } },
  { id: "cool", emoji: "😎", label: { en: "Cool Face", zh: "酷酷笑脸" } },
  { id: "starstruck", emoji: "🤩", label: { en: "Star Eyes", zh: "星星眼" } },
  { id: "smile", emoji: "😊", label: { en: "Smiley", zh: "微笑" } },
  { id: "party", emoji: "🥳", label: { en: "Party Face", zh: "派对笑脸" } },
  { id: "cowboy", emoji: "🤠", label: { en: "Cowboy", zh: "牛仔笑脸" } },
  { id: "alien", emoji: "👽", label: { en: "Friendly Alien", zh: "友好外星人" } },
  { id: "ghost", emoji: "👻", label: { en: "Friendly Ghost", zh: "友好小幽灵" } },
  { id: "teddy", emoji: "🧸", label: { en: "Teddy Bear", zh: "泰迪熊" } }
].map(avatar => Object.freeze({ ...avatar, label: Object.freeze(avatar.label) })));

export const DEFAULT_AVATAR_ID = "robot";
export const AVATAR_IDS = Object.freeze(AVATARS.map(avatar => avatar.id));

export function avatarById(id) {
  return AVATARS.find(avatar => avatar.id === id) || null;
}

export function avatarFromLegacyEmoji(emoji) {
  return AVATARS.find(avatar => avatar.emoji === emoji) || { id: "legacy", emoji: emoji || "🤖", label: { en: "Legacy avatar", zh: "旧版头像" } };
}

export function resolveAvatar(member = {}) {
  return avatarById(member.avatarId) || avatarFromLegacyEmoji(member.emoji);
}

export function randomAvatar(currentId = null, randomSource = globalThis.crypto) {
  const choices = AVATARS.filter(avatar => avatar.id !== currentId);
  if (!choices.length) return avatarById(currentId) || avatarById(DEFAULT_AVATAR_ID);
  try {
    const values = new Uint32Array(1);
    randomSource.getRandomValues(values);
    return choices[values[0] % choices.length];
  } catch {
    return avatarById(DEFAULT_AVATAR_ID);
  }
}

export function availableAvatars(usedIds = [], limit = 3) {
  const used = new Set(usedIds);
  return AVATARS.filter(avatar => !used.has(avatar.id)).slice(0, limit);
}
