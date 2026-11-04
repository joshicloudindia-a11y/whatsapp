/**
 * [chat] Static emoji set for the inbox emoji picker and reaction bar.
 * Emojis are message CONTENT here (sent to WhatsApp), not UI icons.
 */

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

export interface EmojiCategory { id: string; label: string; icon: string; emojis: string[] }

const split = (s: string) => [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s.replace(/\s+/g, ""))].map((x) => x.segment);

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: "smileys", label: "Smileys & people", icon: "mood",
    emojis: split("😀😃😄😁😆😅🤣😂🙂🙃😉😊😇🥰😍🤩😘😗😚😙😋😛😜🤪😝🤑🤗🤭🤫🤔🤐🤨😐😑😶😏😒🙄😬😮‍💨🤥😌😔😪🤤😴😷🤒🤕🤢🤮🥵🥶🥴😵🤯🤠🥳😎🤓🧐😕😟🙁😮😯😲😳🥺😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬😈💀💩🤡👻👽🤖"),
  },
  {
    id: "gestures", label: "Gestures", icon: "back_hand",
    emojis: split("👋🤚🖐✋🖖👌🤌🤏✌️🤞🤟🤘🤙👈👉👆👇☝️👍👎✊👊🤛🤜👏🙌👐🤲🤝🙏✍️💅🤳💪🦾👀👁👅👄🧠🫶"),
  },
  {
    id: "hearts", label: "Hearts & symbols", icon: "favorite",
    emojis: split("❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝💟✅☑️✔️❌❎➕➖➗✳️✴️❇️‼️⁉️❓❔❕❗💯🔥✨⭐🌟💫💥💢💤💬💭🔔🔕📣📢⚠️🚫⛔🆗🆕🆓"),
  },
  {
    id: "animals", label: "Animals & nature", icon: "pets",
    emojis: split("🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🙈🙉🙊🐔🐧🐦🐤🦆🦅🦉🐴🦄🐝🦋🐌🐞🐢🐍🐙🐠🐬🐳🌵🌲🌳🌴🌱🌿☘️🍀🍁🍂🌷🌹🌺🌸🌼🌻🌞🌝🌙⭐🌈☀️⛅☁️🌧⛈❄️☃️🌊"),
  },
  {
    id: "food", label: "Food & drink", icon: "restaurant",
    emojis: split("🍏🍎🍐🍊🍋🍌🍉🍇🍓🫐🍈🍒🍑🥭🍍🥥🥝🍅🥑🥦🌽🥕🥔🍞🧀🥚🍳🥞🥓🍗🍔🍟🍕🌭🥪🌮🌯🥗🍝🍜🍲🍛🍣🍱🥟🍤🍚🍰🎂🍩🍪🍫🍬🍭🍯☕🍵🥤🧃🍺🍻🥂🍷🍹"),
  },
  {
    id: "activities", label: "Activities & travel", icon: "sports_soccer",
    emojis: split("⚽🏀🏈⚾🎾🏐🏉🎱🏓🏸🏏⛳🏹🎣🥊🥋🎯🎮🎲🧩🎨🎬🎤🎧🎼🎹🥁🎸🏆🥇🥈🥉🏅🎉🎊🎈🎁🎀🚗🚕🚌🚑🚒🚓🚚🚲🛵🏍✈️🚀🚁⛵🚢🏠🏡🏢🏬🏥🏦🏨🏪🏫⛪🕌🗽🗼🏖🏝"),
  },
  {
    id: "objects", label: "Objects", icon: "lightbulb",
    emojis: split("⌚📱💻⌨️🖥🖨🖱💾💿📷📸📹🎥📞☎️📺📻⏰⏳⌛💡🔦🕯💸💵💴💶💷💰💳🧾💎⚖️🔧🔨🛠⚙️🔩🧰🧲🔫💣🔪🛡🔑🗝🔒🔓📦📫📬📮✉️📧📨📩📝📄📃📑📊📈📉📅📆📌📍📎✂️🖊️✏️🔍🔎"),
  },
  {
    id: "flags", label: "Flags", icon: "flag",
    emojis: split("🏁🚩🎌🏴🏳️🏳️‍🌈🇮🇳🇺🇸🇬🇧🇨🇦🇦🇺🇦🇪🇸🇦🇸🇬🇲🇾🇮🇩🇵🇭🇹🇭🇻🇳🇯🇵🇰🇷🇨🇳🇩🇪🇫🇷🇮🇹🇪🇸🇵🇹🇳🇱🇧🇷🇲🇽🇦🇷🇿🇦🇳🇬🇰🇪🇪🇬🇹🇷🇵🇰🇧🇩🇱🇰🇳🇵"),
  },
];
