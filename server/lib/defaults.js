/* =========================================================
   ふわり Fuwari — 初始内容
   第一次启动时写进 data/content.json，之后一律以数据文件为准。
   ========================================================= */
"use strict";

function defaultContent() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    site: {
      brand: "ふわり",
      brandEn: "Fuwari",
      logo: "assets/img/logo.svg",
      tagline: "把日常，过成一颗糖。",
      title: "ふわり Fuwari · 柚子的二次元慢速手帐",
      eyebrowYear: "2026",
      heroTitleTop: "把日常，",
      heroTitleBottom: "过成一颗糖。",
      lede: "这里是柚子的慢速手帐。记录窗边四点的光、VRChat 的星海，还有一个叫星澈的人。",
      heroImage: "assets/img/hero-girl.svg",      heroCaption: "「 窗边的下午四点 」",
      moodLabel: "今日心情",
      moodWord: "晴转草莓",
      moodNote: "适合慢慢发光",
      countdownNote: "想和你再过一次春天",
      footerText: "把日常，过成一颗糖。<br>一个慢速更新中的二次元个人博客。",
      footerScript: "see you tomorrow ♥",
      footerNote: "「如果今天有点累，<br>就先把糖含化，再往前走。」",
      copyright: "© 2026 ふわり Fuwari · 用奶油色和一点点心动搭成",
      ticker: [
        "今日份的甜",
        "慢一点也没关系",
        "窗边的光刚刚好",
        "草莓牛奶要加冰",
        "在星海等你下线",
        "把普通日子过成纪念日"
      ],
      links: [
        { label: "VRChat", value: "Yuzu_mochi", toast: "VRChat 搜索 Yuzu_mochi，记得敲门哦。" },
        { label: "Pixiv", value: "@fuwari_yuzu", toast: "Pixiv 同名：ふわり柚子。" },
        { label: "Email", value: "hi@fuwari.moe", toast: "写信给我：hi@fuwari.moe" }
      ]
    },
    owner: {
      name: "柚子",
      latin: "Yuzu",
      roles: "插画师 / 世界建造者",
      avatar: "assets/img/avatar-yuzu.svg",
      alt: "柚子：淡紫色长发、贝雷帽的二次元头像",
      handle: "@yuzu_mochi",
      vrcId: "Yuzu_mochi",
      status: "在线",
      statusAway: false,
      bio: "「在搭一个有很多窗户的小世界。欢迎来坐，但进门记得脱鞋。」",
      info: [
        { label: "常用模型", value: "柚子猫耳 ver.2" },
        { label: "身高", value: "1.52 m" },
        { label: "喜欢的世界", value: "樱花温泉 / 星海营地" },
        { label: "上线时间", value: "22:00 — 02:00" }
      ],
      tags: ["拍照", "世界建造", "甜食", "猫", "慢节奏"],
      vrcCover: "ふわり星海 · 私人小屋",
      vrcStatus: "在线 · 私密世界",
      vrcStatusAway: false,
      mutual: "与星澈 · 同居中",
      signature: "Yuzu",
      signNote: "慢一点，也是在往前。",
      aboutTitle: "你好，我是",
      aboutParagraphs: [
        "一个把生活调成 0.8 倍速的插画师。喜欢奶油色、旧书页、便利店关东煮，以及一切圆滚滚的东西。",
        "白天画稿，晚上钻进 VRChat 搭小世界。2022 年春天遇见星澈，从此每个普通星期三都变得值得记录。这里是我的手帐，也是我们的小小存档点。"
      ],
      aboutTags: ["插画", "VRChat", "手帐", "咖啡", "猫", "草莓牛奶"],
      currently: [
        { label: "在做", value: "VRChat 世界「ふわり星海」" },
        { label: "在读", value: "《傍晚的咖啡店》" },
        { label: "在听", value: "雨声 + 坂本龍一" }
      ],
      readNote: "在窗边，慢慢写。"
    },
    partner: {
      name: "星澈",
      latin: "Sei",
      roles: "程序员 / 深夜露营者",
      avatar: "assets/img/avatar-sei.svg",
      alt: "星澈：银蓝色头发、薄荷卫衣的二次元头像",
      handle: "@sei_star",
      vrcId: "Sei_starfall",
      status: "挂机中",
      statusAway: true,
      bio: "「负责在深夜说『再玩五分钟』。现实里写代码，VRChat 里搭帐篷。」",
      info: [
        { label: "常用模型", value: "星澈 · 夜航 ver." },
        { label: "身高", value: "1.78 m" },
        { label: "喜欢的世界", value: "星海营地 / 旧书店" },
        { label: "上线时间", value: "23:00 — 03:00" }
      ],
      tags: ["吉他", "摄影", "夜猫", "热可可", "搭帐篷"],
      vrcCover: "星海营地 · 深夜场",
      vrcStatus: "挂机中 · 星海营地",
      vrcStatusAway: true,
      mutual: "与柚子 · 同居中"
    },
    couple: {
      since: "2022-05-20T20:00:00+08:00",
      sinceLabel: "2022.05.20",
      anniversary: "05-20",
      titleTop: "砂糖",
      titleBottom: "情侣",
      eyebrow: "SUGAR COUPLE · VRChat SWEETHEARTS",
      lede: "在 VRChat 的星海里，找到一个想一起下线的人。<br>这里存着我们所有软乎乎的、甜而不腻的时刻。",
      note: "我们常驻的世界叫「ふわり星海」，是一个有玻璃温室、旧书店和一片会下樱花雨的营地的小世界。如果你在深夜路过，欢迎进来烤火。",
      wallNote: "相纸会泛黄，但那天的心动不会。",
      timelineTitle: "我们的小时间线",
      timelineFoot: "未完待续，下一章还在写。",
      wish: "2027.05.20 · 想和你去看一次海，<br>然后拍一张不用滤镜的合照。"
    },
    articles: [
      {
        id: "latte",
        title: "把秋天装进一杯桂花拿铁",
        tag: "日常",
        date: "2026-10-12",
        read: "6 分钟",
        image: "assets/img/scene-cafe.svg",
        alt: "雨天咖啡馆里的两杯桂花拿铁",
        excerpt: "下雨的下午，我们躲进街角咖啡馆。你把奶泡推到我面前，说这一杯有桂花的味道，也有点像去年秋天。",
        body: [
          { type: "p", text: "出门的时候只飘着一点雨丝，走到半路忽然大了起来。我们没有带伞，只好一人护着一只帆布包，踩着水洼往街角那家咖啡馆跑。推门进去的时候，风铃响了三声，暖气裹着咖啡香扑过来，眼镜立刻起了一层白雾。" },
          { type: "p", text: "你替我擦镜片，动作笨手笨脚，把左边的镜腿掰得有点歪。我笑你，你也不恼，只说「反正你戴歪的也好看」。窗外的雨顺着玻璃往下爬，把整条街的灯光都拉成了细长的、暖黄色的线。" },
          { type: "h2", text: "一杯有秋天味道的拿铁" },
          { type: "p", text: "老板说今天有刚到的桂花糖浆，问我们要不要试试。你点头点得很快，像怕他反悔。两杯拿铁端上来的时候，奶泡上真的撒了几粒干桂花，热气一烘，甜香就慢慢散开，不浓，刚刚好。" },
          { type: "p", text: "我喝了一口，觉得像小时候外婆晒在竹匾里的桂花，也像去年秋天我们第一次一起走的那条路。你说同一杯咖啡被两个人喝，味道会不会不一样。我说会，你那一杯一定更甜，因为你总是先加糖。" },
          { type: "quote", text: "「秋天不是突然来的，是被一杯热饮慢慢泡开的。」" },
          { type: "p", text: "后来雨小了，我们还是没有走。你把手机翻过来扣在桌上，说今天不拍工作的事。我们就看窗外的人撑着伞经过，猜他们要去哪里，给每一把伞编一个故事。时间过得很慢，慢到一杯拿铁凉透了，我们才想起来要回家。" },
          { type: "p", text: "回家路上，你把我的手塞进你的外套口袋。口袋里有几颗不知道什么时候剩下的糖，和一张折得小小的购物清单。秋天就这样被装进了口袋，也被装进了那杯已经喝完的拿铁里。" }
        ]
      },
      {
        id: "camp",
        title: "和你在星海露营的那晚",
        tag: "VRChat",
        date: "2026-09-28",
        read: "5 分钟",
        image: "assets/img/scene-camp.svg",
        alt: "星海露营的发光帐篷和篝火",
        excerpt: "帐篷是薄荷绿的，篝火噼啪响。你说下线之前，再看一次流星吧。",
        body: [
          { type: "p", text: "那天上线的时候已经很晚了。现实里的窗外没有星星，只有对面楼还亮着两扇窗。可一戴上头显，星海就铺天盖地地涌过来，近得像一伸手就能捞到。" },
          { type: "p", text: "你在营地入口等我，穿着一件我从没见过的外套，手里拎着两串棉花糖。你说这个世界的作者新加了篝火音效，让我闭上眼听。噼啪、噼啪，木头裂开的声音很轻，却让人觉得安心。" },
          { type: "h2", text: "薄荷绿的帐篷" },
          { type: "p", text: "帐篷是我们一起搭的。你负责立杆，我负责把灯串绕在门口，最后两个人在里面铺毯子，铺得歪歪扭扭。你躺下来，说从这个角度看，帐篷顶像一片倒过来的薄荷海。" },
          { type: "p", text: "我们聊了很多没用的事：如果猫会说话，第一句会抱怨什么；便利店关东煮里最好吃的是不是萝卜；明年要不要去看一次真的海。你说看海要挑没有月亮的晚上，这样星星才够亮。我说好，但你要负责带外套。" },
          { type: "quote", text: "「在虚拟世界里许的愿望，也会被现实听见吗？」" },
          { type: "p", text: "流星出现的时候，你正好在给棉花糖翻面。我喊你看，你抬头，糖差点掉进火里。我们都没来得及许愿，只顾着笑。后来你说，不许也没关系，想要的东西本来就不多。" },
          { type: "p", text: "下线之前，我们在帐篷门口坐了一会儿。远处的星云慢慢转，篝火把影子拉得很长。你说「明天见」，我说「明天见」。摘下头显以后，房间很安静，可耳朵里好像还留着一点木头燃烧的声音。" }
        ]
      },
      {
        id: "room",
        title: "雨天的房间，适合慢慢发光",
        tag: "家居",
        date: "2026-09-06",
        read: "4 分钟",
        image: "assets/img/scene-room.svg",
        alt: "雨天房间里亮着暖灯的书桌",
        excerpt: "把台灯调暗一点，让雨声先进来。房间和我，都在慢慢变软。",
        body: [
          { type: "p", text: "周日下午开始下雨，原本计划出门买颜料，最后把鞋又放回了鞋柜。我给自己泡了一杯茶，把窗帘拉开一半，让灰色的天光落在地板上。" },
          { type: "p", text: "房间其实有点乱：桌角堆着没拆的快递，椅子上搭着昨天的外套，画笔在笔筒里横七竖八。可雨声一响，这些杂乱忽然都变得可以原谅，像生活本来就该有的毛边。" },
          { type: "h2", text: "把灯调暗一点" },
          { type: "p", text: "我关掉顶灯，只留书桌那盏暖黄色的小灯。光落在木桌上，木纹变得很清楚。猫跳上来，在灯下团成一个圆，尾巴尖一抖一抖。我伸手摸它，它假装睡着，喉咙里却开始呼噜。" },
          { type: "p", text: "手帐翻到空白的一页，我写了日期，又停下来。雨天好像不适合写太完整的东西，只适合记一些碎片：茶有点烫、猫踩到了我的橡皮、窗外的雨比刚才密了一点。" },
          { type: "quote", text: "「房间不必一直整洁，能接住疲惫就好。」" },
          { type: "p", text: "傍晚的时候，星澈发来消息问要不要上线。我回他：今天想待在房间里，慢慢发光。他过了一会儿发来一张图，是他那边的窗，也在下雨。我们就这样隔着两个城市，各自听了一会儿雨。" }
        ]
      },
      {
        id: "letter",
        title: "给夏天写一封慢信",
        tag: "随想",
        date: "2026-08-21",
        read: "3 分钟",
        image: "assets/img/scene-letter.svg",
        alt: "夏日窗边写信的桌面",
        excerpt: "等蝉声停下来，再把这封信寄出去。",
        body: [
          { type: "p", text: "夏天快结束的时候，我找出了一叠浅蓝色的信纸。不是要寄给谁，只是想把一些来不及说出口的话，认真地写下来。" },
          { type: "p", text: "第一页写风。写午后把窗帘吹起来又放下的那阵风，写它路过阳台时带走了洗衣液的香味。第二页写声音：蝉、风扇、冰箱压缩机、楼下小孩踩水。写着写着，发现夏天原来是由这些琐碎的声音组成的。" },
          { type: "h2", text: "写给还没到来的秋天" },
          { type: "p", text: "信里也写了一点害怕。害怕天气凉下来以后，有些情绪会跟着一起缩回去；害怕忙碌重新占满日程，答应自己的散步又无限延期。可写完又觉得，能把害怕写出来，就已经轻了一半。" },
          { type: "quote", text: "「有些告别不必郑重，把信折好，放进抽屉就算数。」" },
          { type: "p", text: "最后我没有把信寄出去，而是夹进了一本旧书里。等明年夏天再翻到它，也许会笑自己写得太酸。但没关系，能在某个下午诚实地坐下来，已经很好了。" }
        ]
      },
      {
        id: "milk",
        title: "草莓牛奶味的星期五",
        tag: "食谱",
        date: "2026-08-02",
        read: "4 分钟",
        image: "assets/img/scene-milk.svg",
        alt: "草莓牛奶和新鲜草莓",
        excerpt: "三颗草莓、半杯牛奶，和一点点想你的甜。",
        body: [
          { type: "p", text: "星期五下班路上，水果店把最后一盒草莓放在门口，贴着「今天熟，快吃」的纸条。我拎回家，决定不做什么复杂的甜点，只做一杯草莓牛奶。" },
          { type: "p", text: "草莓要挑颜色深一点的，闻起来有香气。洗的时候不要摘蒂，免得进水变得软塌塌。这个习惯是外婆教的，她做什么都慢，连洗水果都像在进行一场小仪式。" },
          { type: "h2", text: "三颗草莓的配方" },
          { type: "p", text: "把三颗草莓切小块，和一小勺蜂蜜一起放进杯底，用勺子轻轻压出汁。倒入冰牛奶，搅两下就好，不要搅得太匀，喝的时候还能看见粉色的纹路。最后把剩下的一颗切成两半，挂在杯沿。" },
          { type: "list", items: ["草莓 4 颗（3 颗压碎，1 颗装饰）", "冰牛奶 200 ml", "蜂蜜 1 小勺，可不加", "如果喜欢更绵密，可以加两小块冰"] },
          { type: "quote", text: "「甜的东西要慢慢喝，才不算浪费。」" },
          { type: "p", text: "我端着杯子坐到窗边，给星澈拍了一张照片。他回我：「看起来像你。」我问哪里像，他说：「粉粉的，而且甜。」我把这句话存了下来，和空杯子一起放进星期五的记忆里。" }
        ]
      }
    ],
    gallery: [
      { id: "g-sakura", image: "assets/img/scene-sakura.svg", alt: "樱花坡道和鸟居下牵手的两道背影", title: "四月 · 樱花坡道", date: "04 / 08", caption: "樱花坡道上，谁也没有先松开手。", size: "wide" },
      { id: "g-fireworks", image: "assets/img/scene-fireworks.svg", alt: "夏夜花火下并肩的两道背影", title: "八月 · 花火大会", date: "08 / 16", caption: "花火升起来的时候，你正好在看我。", size: "normal" },
      { id: "g-cafe", image: "assets/img/scene-cafe.svg", alt: "雨天窗边的咖啡桌", title: "九月 · 雨天咖啡馆", date: "09 / 12", caption: "雨天的咖啡馆，两杯拿铁慢慢变凉。", size: "normal" },
      { id: "g-camp", image: "assets/img/scene-camp.svg", alt: "星海下的发光帐篷", title: "九月 · 星海露营", date: "09 / 28", caption: "星海营地，篝火和你都在发光。", size: "tall" },
      { id: "g-snow", image: "assets/img/scene-snow.svg", alt: "初雪街道上共围一条围巾的两人", title: "十二月 · 初雪", date: "12 / 24", caption: "初雪那天，一条围巾分给两个人。", size: "normal" },
      { id: "g-birthday", image: "assets/img/scene-birthday.svg", alt: "生日蛋糕和两个人的房间", title: "五月 · 生日房间", date: "05 / 20", caption: "蜡烛吹灭之前，偷偷许了一个关于你的愿望。", size: "normal" },
      { id: "g-room", image: "assets/img/scene-room.svg", alt: "雨天温暖的书桌", title: "九月 · 房间一角", date: "09 / 06", caption: "雨声、台灯、写到一半的手帐。", size: "normal" },
      { id: "g-letter", image: "assets/img/scene-letter.svg", alt: "夏日窗边写信的桌子", title: "八月 · 夏日慢信", date: "08 / 21", caption: "给夏天写信，结尾总是「下次见」。", size: "wide" }
    ],
    wall: [
      { id: "w-sakura", image: "assets/img/scene-sakura.svg", alt: "樱花坡道与鸟居下牵手的两人", title: "第一次见面", caption: "2022.05.20 · 樱花坡道" },
      { id: "w-fireworks", image: "assets/img/scene-fireworks.svg", alt: "夏夜花火下并肩的两人", title: "花火大会", caption: "2022.08.16 · 第二排，偷偷牵手" },
      { id: "w-cafe", image: "assets/img/scene-cafe.svg", alt: "雨天咖啡馆的桌边", title: "雨天咖啡馆", caption: "2023.09.12 · 一杯不加糖" },
      { id: "w-camp", image: "assets/img/scene-camp.svg", alt: "星海下的发光帐篷", title: "星海露营", caption: "2025.09.28 · 帐篷里漏进一颗星" },
      { id: "w-snow", image: "assets/img/scene-snow.svg", alt: "初雪里共围一条围巾的两人", title: "初雪", caption: "2022.12.24 · 一条围巾，两个人" },
      { id: "w-birthday", image: "assets/img/scene-birthday.svg", alt: "生日蛋糕前一起吹蜡烛", title: "生日房间", caption: "2026.05.20 · 蜡烛是 5 和 2" },
      { id: "w-room", image: "assets/img/scene-room.svg", alt: "雨天里各做各事的房间", title: "周末的房间", caption: "2026.09.06 · 各做各的事" },
      { id: "w-letter", image: "assets/img/scene-letter.svg", alt: "夏日窗边写信的桌子", title: "夏日慢信", caption: "2026.08.21 · 写给你的第 37 封" }
    ],
    timeline: [
      { id: "t-1", date: "2022.05.20", title: "樱花世界的第一次相遇", text: "你在鸟居下「迷路」，我假装也迷路。其实那天我绕了三圈。" },
      { id: "t-2", date: "2022.08.16", title: "第一次一起看花火", text: "你说花火很吵，但一整晚都没有松开手。" },
      { id: "t-3", date: "2022.12.24", title: "初雪，与同一条围巾", text: "现实里第一次见面，比模型还紧张。你把围巾分我一半。" },
      { id: "t-4", date: "2024.08.02", title: "搬进有小窗户的家", text: "一只猫、六盆绿植、两副碗筷，和永远抢不到的靠窗位。" },
      { id: "t-5", date: "2026.05.20", title: "第五年，把「以后」又说了一遍", text: "蛋糕上的蜡烛是 5 和 2。愿望和第一年一样。" }
    ],
    notes: [
      { id: "seed-1", name: "小满", text: "在星海营地迷路的时候，是你们两个把我捡回去的。谢谢那杯热可可，还有陪我走到传送门。", color: "mint", date: "2026.09.30", likes: 12 },
      { id: "seed-2", name: "阿盐", text: "第一次看到有人把 VRChat 的日常拍得这么像电影。要一直更新啊，我会一直在罐子外面等糖吃。", color: "lav", date: "2026.10.02", likes: 9 },
      { id: "seed-3", name: "桃桃", text: "5·20 快乐！今年也要一起吃草莓蛋糕。顺便问一句，合照墙第三张的咖啡馆在哪里，好想去。", color: "pink", date: "2026.10.05", likes: 21 },
      { id: "seed-4", name: "Nagi", text: "深夜看完合照墙，突然想给远方的人发一句晚安。谢谢你们把温柔存得这么好。", color: "cream", date: "2026.10.11", likes: 7 },
      { id: "seed-5", name: "星澈", text: "第 1,613 天。明天也一起上线吧。帐篷我已经搭好了，这次不会再把杆装反。", color: "lav", date: "2026.10.18", likes: 33 }
    ],
    about: {
      eyebrow: "ABOUT YUZU"
    }
  };
}

module.exports = { defaultContent };
