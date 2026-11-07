import type { JournalCopy, JournalFragment } from "./sampleContent";

export interface JournalEntryDay {
  id: string;
  mood: number;
  title: JournalCopy;
}

export const JOURNAL_ENTRY_DAYS: readonly JournalEntryDay[] = [
  {
    "id": "2026-09-24",
    "mood": 3,
    "title": {
      "zh-TW": "效率、生產力、速度",
      "zh-CN": "效率、生产力、速度",
      "en": "efficiency, productivity, speed"
    }
  },
  {
    "id": "2026-10-03",
    "mood": 4,
    "title": {
      "zh-TW": "向平均收斂",
      "zh-CN": "向平均收敛",
      "en": "convergence to the mean"
    }
  },
  {
    "id": "2026-10-05",
    "mood": 4,
    "title": {
      "zh-TW": "懷念 Steve",
      "zh-CN": "怀念 Steve",
      "en": "remembering Steve"
    }
  },
  {
    "id": "2026-10-17",
    "mood": 5,
    "title": {
      "zh-TW": "感覺",
      "zh-CN": "感觉",
      "en": "feelings"
    }
  },
  {
    "id": "2026-10-25",
    "mood": 4,
    "title": {
      "zh-TW": "一起掙扎",
      "zh-CN": "一起挣扎",
      "en": "struggle together"
    }
  },
  {
    "id": "2026-10-29",
    "mood": 4,
    "title": {
      "zh-TW": "擴增人類智慧",
      "zh-CN": "扩增人类智慧",
      "en": "augmenting human intellect"
    }
  },
  {
    "id": "2026-10-30",
    "mood": 5,
    "title": {
      "zh-TW": "大男孩",
      "zh-CN": "大男孩",
      "en": "big boy"
    }
  },
  {
    "id": "2026-11-06",
    "mood": 4,
    "title": {
      "zh-TW": "當我真正開始愛自己",
      "zh-CN": "当我真正开始爱自己",
      "en": "as i began to love myself"
    }
  }
];

export const JOURNAL_ENTRY_FRAGMENTS: readonly JournalFragment[] = [
  {
    "id": "speed-note",
    "dayId": "2026-09-24",
    "kind": "text",
    "text": {
      "zh-TW": "我們一直崇拜這些詞，彷彿那就是活著的理由\n\n更快產出\n合併更多\n管理更多 agent\n壓縮每一個迴圈\n拿掉每一次停頓\n把每個小時都變成產出\n\n可是如果沒剩下時間好好思考，無止盡的生產又有什麼意義\n\n不是反應\n不是優化\n不是摘要\n不是清空待辦\n\n思考\n\n陪一個問題待得夠久，直到真正的意圖開始浮現\n去找那些動作底下的目的\n去問被加速的那件事，到底該不該存在\n\n人工智慧可以是一塊新畫布\n\n一種做出新奇產物的方式\n屬於自己的產物\n不可能的產物\n工具、世界、詩、遊戲、介面、電影、語言、儀式\n讓更多人摸到自己想像的形狀\n\n可是相反，太多都在變成垃圾工廠\n\n更多內容\n更多轉化\n更多工單\n更多假裝成價值的假工作\n\n你可以合併兩千個 PR\n你可以管理五百個 agent\n你可以醒來面對儀表板，證明機器在你睡覺時一直在動\n\n可是如果你一天只睡五小時，又有什麼意義\n\n如果你不再跟其他人說話，又有什麼意義\n不再了解過去？\n不再玩？\n不再遊蕩？\n不再感到驚喜？\n\n如果你整個人生都在優化那個正在吞噬你的系統，又有什麼意義\n\n速度不是意義\n規模不是智慧\n自動化不是自由，如果它只是讓所有人跑得更快\n\n那我們在往哪跑？\n\n朝向什麼？\n\n一個人人都變成機器管理員的世界，而每台機器都在生產更多沒人真正有時間去想要的東西？\n\n危險不是人工智慧讓我們變懶\n\n危險是人工智慧讓我們永遠忙碌\n\n它在我們找到意圖之前，給了無限的生產\n在我們長出品味之前，給了無限的執行\n在我們學會靜下來之前，給了無限的移動\n\n也許真正的前線不是更快\n\n也許是辨識力\n\n知道什麼不該做\n知道何時該停\n知道最有生產力的事是睡覺、讀歷史、打電話給朋友、跟貓玩、走路卻不追蹤，或盯著天花板直到假的急迫感溶解\n\n工具該給我們更多生命\n而不是把生命變成工具\n\n如果人工智慧真的要有意義，它不該只幫我們生產更多\n\n它該幫我們變得更像人\n更有想像力\n更自由\n\n不然，還是同一座舊工廠\n只是沒有人",
      "zh-CN": "我们一直崇拜这些词，仿佛那就是活着的理由\n\n更快产出\n合并更多\n管理更多 agent\n压缩每一个回圈\n拿掉每一次停顿\n把每个小时都变成产出\n\n可是如果没剩下时间好好思考，无止尽的生产又有什么意义\n\n不是反应\n不是优化\n不是摘要\n不是清空待办\n\n思考\n\n陪一个问题待得够久，直到真正的意图开始浮现\n去找那些动作底下的目的\n去问被加速的那件事，到底该不该存在\n\n人工智慧可以是一块新画布\n\n一种做出新奇产物的方式\n属于自己的产物\n不可能的产物\n工具、世界、诗、游戏、介面、电影、语言、仪式\n让更多人摸到自己想像的形状\n\n可是相反，太多都在变成垃圾工厂\n\n更多内容\n更多转化\n更多工单\n更多假装成价值的假工作\n\n你可以合并两千个 PR\n你可以管理五百个 agent\n你可以醒来面对仪表板，证明机器在你睡觉时一直在动\n\n可是如果你一天只睡五小时，又有什么意义\n\n如果你不再跟其他人说话，又有什么意义\n不再了解过去？\n不再玩？\n不再游荡？\n不再感到惊喜？\n\n如果你整个人生都在优化那个正在吞噬你的系统，又有什么意义\n\n速度不是意义\n规模不是智慧\n自动化不是自由，如果它只是让所有人跑得更快\n\n那我们在往哪跑？\n\n朝向什么？\n\n一个人人都变成机器管理员的世界，而每台机器都在生产更多没人真正有时间去想要的东西？\n\n危险不是人工智慧让我们变懒\n\n危险是人工智慧让我们永远忙碌\n\n它在我们找到意图之前，给了无限的生产\n在我们长出品味之前，给了无限的执行\n在我们学会静下来之前，给了无限的移动\n\n也许真正的前线不是更快\n\n也许是辨识力\n\n知道什么不该做\n知道何时该停\n知道最有生产力的事是睡觉、读历史、打电话给朋友、跟猫玩、走路却不追踪，或盯着天花板直到假的急迫感溶解\n\n工具该给我们更多生命\n而不是把生命变成工具\n\n如果人工智慧真的要有意义，它不该只帮我们生产更多\n\n它该帮我们变得更像人\n更有想像力\n更自由\n\n不然，还是同一座旧工厂\n只是没有人",
      "en": "we keep worshipping these words like they are what we live for\n\nship faster\nmerge more\nmanage more agents\ncompress every loop\nremove every pause\nturn every hour into output\n\nbut what is the point of endless production if there is no time left to think deeply?\n\nnot react\nnot optimize\nnot summarize\nnot clear the queue\n\nthink\n\nto sit with a question long enough that your real intention starts to appear\nto find the purpose underneath the motion\nto ask whether the thing being accelerated should exist at all\n\nai could be a new canvas\n\na way to make strange things\npersonal things\nimpossible things\ntools, worlds, poems, games, interfaces, films, languages, rituals\nthings that let more people touch the shape of their own imagination\n\nbut instead, so much of it is becoming slop factories\n\nmore content\nmore funnels\nmore tickets\nmore fake work pretending to be value\n\nyou can merge 2000 prs\nyou can manage 500 agents\nyou can wake up to dashboards proving that the machine kept moving while you slept\n\nbut what is the point if you only sleep 5 hours a day?\n\nwhat is the point if you stop talking to other humans?\nstop learning about the past?\nstop playing?\nstop wandering?\nstop being surprised?\n\nwhat is the point if your whole life becomes optimizing the system that is consuming you?\n\nspeed is not meaning\nscale is not wisdom\nautomation is not freedom if it only makes everyone run faster\n\nand where are we running?\n\ntoward what?\n\na world where every person becomes a manager of machines, and every machine produces more things no one had the time to truly want?\n\nthe danger is not that ai makes us lazy\n\nthe danger is that ai makes us endlessly busy\n\nthat it gives us infinite production before we have found intention\ninfinite execution before we have developed taste\ninfinite motion before we have learned how to be still\n\nmaybe the real frontier is not more speed\n\nmaybe it is discernment\n\nknowing what not to make\nknowing when to stop\nknowing when the most productive thing is to sleep, read history, call a friend, play with a cat, walk without tracking it, or stare at the ceiling until the false urgency dissolves\n\ntools should give us more life\nnot turn life into a tool\n\nif ai is going to matter, it should not just help us produce more\n\nit should help us become more human\nmore imaginative\nmore free\n\notherwise, it’s the same old factory\njust without humans"
    },
    "photo": null,
    "x": 33,
    "y": 44,
    "w": 32,
    "rotate": 1
  },
  {
    "id": "mean-note",
    "dayId": "2026-10-03",
    "kind": "text",
    "text": {
      "zh-TW": "當每個人都看著別人來決定要做什麼，我們終究會不再做出任何屬於自己的東西。\n\n我們複製行得通的東西。借用別人的語言、美感、功能。我們說這是向市場學習、遵循最佳實踐、保持競爭力。放在一起看，一切都開始顯得眼熟。精緻、可以互換。沒有哪裡不對。也沒有哪裡是活的。\n\n平均不一定是壞事。當我們拿掉讓東西與眾不同的理由，所有東西最後都會落在那裡。\n\n數字比感受容易比較，所以我們做出會產生數字的東西。我們研究什麼能吸引注意，再照著它塑造自己。到後來，回饋不再為作品提供參考，而是開始替作品下筆。我們不再問自己想說什麼。我們問的是，說什麼會被獎勵。\n\n人工智慧讓這個迴圈完全沒有摩擦。它能取用的參考，比我們一輩子看得到的還多。但能接觸每一種觀點，不等於擁有一種觀點。它沒有活過某一段具體的人生，讓某個細節變得難以忍受，讓另一個細節變得美。當我們不帶任何自己的意圖，就請它替我們選擇，得到的是看似合理、很容易就點頭通過的東西。\n\n然後我們把它上線、衡量、複製，再餵回下一輪。一場平庸的海嘯。\n\n這改變的不只是作品，還有做作品的人。\n\n我們用平台能推送、市場能理解的類別來描述自己。設計師。創辦人。創作者。選一個定位。打造品牌。保持一致。放不進去的部分變得礙事，即使那些矛盾，可能會長出我們最有意思的作品。我們變得更容易被歸類，也更難分辨彼此。\n\n我覺得我們需要更像藝術家那樣去做東西。\n\n藝術家是透過作品長出觀點的。做、留意、選擇、失敗、再回來。即使沒有別人在乎，也慢慢學會什麼才重要。手藝讓這個觀點有了形體，精準到別人也能親身感受。\n\n作品之外的人生也很重要。你住過的地方，你愛過的人，那些你在乎、卻不好意思說出口的東西。這些不是妨礙你有話可說的干擾。它們正是你之所以有話可說的來處。\n\n對音樂、繪畫、照片、電影，我們都懂這個道理。我們期待在那些選擇裡，有一個人在場。我們想體驗一些要不是他們，我們就不會遇見的東西。\n\n軟體也做得到。\n\n一款軟體，表達的是它對生活應該是什麼感覺的信念。什麼值得你注意。哪些東西你應該能自由更改。一件事做起來該像填表格，還是像在玩。即使是一個小小的互動，也能承載某個人的用心、幽默或好奇。\n\n但我們很少把軟體當成一種媒介來談。我們把它當成一個產業來談。要搶的市場、要優化的流程、要追上的對手。別人有某個功能，我們就加上去，卻不問它屬不屬於這裡。產品堆滿了一樣的零件，也丟掉了當初讓人選擇它的理由。\n\n在品牌包裝底下，全都是同一個東西。\n\n藝術家也會向別人學習。問題在於，你是把那些影響吸收成自己的觀點，還是拿它們來逃避長出觀點。\n\n你想讓某個人感受到、理解到，或做到什麼？為什麼是這個形狀？你注意到了什麼，是現有工具似乎沒注意到的？\n\n這些問題的答案，沒辦法從競爭對手的路線圖裡借來。\n\n如果我們幾乎什麼都做得出來，決定什麼值得存在就變得更重要，而不是更不重要。速度給了我們更多運用判斷的機會。它並沒有拿走這份責任。\n\n我不想要一個人人都只是把同樣的想法散播得更有效率的世界。我希望大家用這些工具，更深入自己真正在乎的東西。做出夠具體的東西，具體到我們能感覺到背後有一個人。\n\n如果最後大家都做出一樣的東西，人人都能做東西又有什麼意義？",
      "zh-CN": "当每个人都看着别人来决定要做什么，我们终究会不再做出任何属于自己的东西。\n\n我们复制行得通的东西。借用别人的语言、美感、功能。我们说这是向市场学习、遵循最佳实践、保持竞争力。放在一起看，一切都开始显得眼熟。精致、可以互换。没有哪里不对。也没有哪里是活的。\n\n平均不一定是坏事。当我们拿掉让东西与众不同的理由，所有东西最后都会落在那里。\n\n数字比感受容易比较，所以我们做出会产生数字的东西。我们研究什么能吸引注意，再照着它塑造自己。到后来，回馈不再为作品提供参考，而是开始替作品下笔。我们不再问自己想说什么。我们问的是，说什么会被奖励。\n\n人工智慧让这个回圈完全没有摩擦。它能取用的参考，比我们一辈子看得到的还多。但能接触每一种观点，不等于拥有一种观点。它没有活过某一段具体的人生，让某个细节变得难以忍受，让另一个细节变得美。当我们不带任何自己的意图，就请它替我们选择，得到的是看似合理、很容易就点头通过的东西。\n\n然后我们把它上线、衡量、复制，再喂回下一轮。一场平庸的海啸。\n\n这改变的不只是作品，还有做作品的人。\n\n我们用平台能推送、市场能理解的类别来描述自己。设计师。创办人。创作者。选一个定位。打造品牌。保持一致。放不进去的部分变得碍事，即使那些矛盾，可能会长出我们最有意思的作品。我们变得更容易被归类，也更难分辨彼此。\n\n我觉得我们需要更像艺术家那样去做东西。\n\n艺术家是透过作品长出观点的。做、留意、选择、失败、再回来。即使没有别人在乎，也慢慢学会什么才重要。手艺让这个观点有了形体，精准到别人也能亲身感受。\n\n作品之外的人生也很重要。你住过的地方，你爱过的人，那些你在乎、却不好意思说出口的东西。这些不是妨碍你有话可说的干扰。它们正是你之所以有话可说的来处。\n\n对音乐、绘画、照片、电影，我们都懂这个道理。我们期待在那些选择里，有一个人在场。我们想体验一些要不是他们，我们就不会遇见的东西。\n\n软体也做得到。\n\n一款软体，表达的是它对生活应该是什么感觉的信念。什么值得你注意。哪些东西你应该能自由更改。一件事做起来该像填表格，还是像在玩。即使是一个小小的互动，也能承载某个人的用心、幽默或好奇。\n\n但我们很少把软体当成一种媒介来谈。我们把它当成一个产业来谈。要抢的市场、要优化的流程、要追上的对手。别人有某个功能，我们就加上去，却不问它属不属于这里。产品堆满了一样的零件，也丢掉了当初让人选择它的理由。\n\n在品牌包装底下，全都是同一个东西。\n\n艺术家也会向别人学习。问题在于，你是把那些影响吸收成自己的观点，还是拿它们来逃避长出观点。\n\n你想让某个人感受到、理解到，或做到什么？为什么是这个形状？你注意到了什么，是现有工具似乎没注意到的？\n\n这些问题的答案，没办法从竞争对手的路线图里借来。\n\n如果我们几乎什么都做得出来，决定什么值得存在就变得更重要，而不是更不重要。速度给了我们更多运用判断的机会。它并没有拿走这份责任。\n\n我不想要一个人人都只是把同样的想法散播得更有效率的世界。我希望大家用这些工具，更深入自己真正在乎的东西。做出够具体的东西，具体到我们能感觉到背后有一个人。\n\n如果最后大家都做出一样的东西，人人都能做东西又有什么意义？",
      "en": "when everyone looks at everyone else to decide what to make, we eventually stop making anything of our own.\n\nwe copy what works. borrow the language, the aesthetic, the features. we call it learning from the market, following best practices, staying competitive. together, everything starts to feel familiar. polished, interchangeable. nothing wrong. nothing alive.\n\nthe mean isn’t necessarily bad. it’s where everything lands when we remove the reasons for it to be different.\n\nnumbers are easier to compare than feelings, so we make things that produce numbers. we study what gets attention, then shape ourselves around it. eventually the feedback stops informing the work and starts authoring it. we’re no longer asking what we want to say. we’re asking what will be rewarded for saying.\n\nai makes this loop frictionless. it can draw from more references than we could see in a lifetime. but access to every perspective isn’t the same as having one. it hasn’t lived a particular life that makes one detail unbearable and another beautiful. when we ask it to choose for us without bringing any intention of our own, we get something plausible, easy to approve.\n\nthen we ship it, measure it, copy it, and feed it back into the next round. a tidal wave of mid.\n\nthis changes not just the work, but the people making it.\n\nwe describe ourselves in categories platforms can distribute and markets understand. designer. founder. creator. pick a niche. build a brand. be consistent. the parts that don’t fit become inconvenient, even when those contradictions might produce our most interesting work. we become easier to classify and harder to tell apart.\n\ni think we need to approach making things more like artists.\n\nan artist develops a perspective through the work. making, noticing, choosing, failing, returning. learning what matters even when nobody else cares. craft gives that perspective a form precise enough for someone else to experience.\n\nthe life outside the work matters too. the places you’ve lived, the people you’ve loved, the things you’re embarrassed to care about. these aren’t distractions from having something to say. they’re how you come to have something to say.\n\nwe understand this with music, paintings, photographs, movies. we expect a person to be present in the choices. we want to experience something we wouldn’t have encountered without them.\n\nsoftware can do this too.\n\na piece of software expresses beliefs about how life should feel. what deserves your attention. what you should be free to change. whether a task should feel like paperwork or play. even a small interaction can carry someone’s care, humor, or curiosity.\n\nbut we rarely talk about software as a medium. we talk about it as an industry. markets to capture, workflows to optimize, competitors to catch up with. we add a feature because someone else has it, without asking whether it belongs. products accumulate the same parts and lose what made them worth choosing.\n\nunderneath the branding, it’s all the same thing.\n\nartists learn from others too. the question is whether you’re absorbing those influences into a point of view, or using them to avoid developing one.\n\nwhat are you trying to let someone feel, understand, or do? why this particular shape? what have you noticed that the existing tools don’t seem to notice?\n\nthose questions don’t have answers you can borrow from a competitor’s roadmap.\n\nif we can make almost anything, deciding what deserves to exist becomes more important, not less. speed gives us more chances to exercise judgment. it doesn’t remove the responsibility.\n\ni don’t want a world where every person becomes a more efficient distributor of the same ideas. i want people to use these tools to go further into what they actually care about. to make things specific enough that we can feel someone behind them.\n\nwhat is the point of everyone being able to make something, if we all end up making the same thing?"
    },
    "photo": null,
    "x": 2,
    "y": 44,
    "w": 32,
    "rotate": -1
  },
  {
    "id": "steve-photo",
    "dayId": "2026-10-05",
    "kind": "photo",
    "text": null,
    "photo": "/journal/alley.jpg",
    "x": 33,
    "y": 30,
    "w": 26,
    "rotate": -2
  },
  {
    "id": "steve-note",
    "dayId": "2026-10-05",
    "kind": "text",
    "text": {
      "zh-TW": "我從小用的電腦，都是米色的方盒子。後來搬到加拿大，看見了 iMac G4。\n\n電腦怎麼可以這麼美？\n\n我買不起 Mac，就把自己的 PC 弄得像一台 Mac。換掉圖示、字體、視窗。學會做那些亮晶晶、讓人想舔一口的按鈕。我就是這樣走進介面設計的。看見了自己愛的東西，就想做出像那樣的東西。\n\n我把 Steve 的發表會燒成 DVD，拿來研究。一遍又一遍地看。那些產品裡有好多用心，向大家展示它們能做到什麼的時候，又有好多喜悅。\n\n我的第一台 iPod 是黑色的 nano。走到哪都帶著。然後 iPhone 出現了，改變了世界。\n\n那時候，感覺什麼都有可能。\n\n他走了以後，我一直覺得我們卡在一個迴圈裡。不停地打磨。更好的供應鏈。更多讓人一直滑下去的方法。那麼多才華花在微小的改進上，留給真正偉大、發自內心的東西的空間，卻那麼少。\n\n發表會一年比一年更像電影。我還是很懷念現場展示。有個人站在台上，玩著自己參與做出來的東西。那種興奮、那些玩笑、那些出包的時刻。很有人味。很好玩。\n\n我們讓電腦更快。手機更薄。加了更多鏡頭。讓機器在越來越多事情上比我們聰明。不知怎麼的，我們也變得更疏離、更孤單了。\n\n我們花了好多力氣想打敗人類。我希望我們能多花點時間，從人們的生活裡學習，讓那些生活變得更好。\n\n工作的時候，我有時還是會想：Steve 會怎麼做？\n\n我永遠不會知道了。沒能跟他一起工作，我很難過。但他的作品傳到了一個用著米色 PC 的孩子手上，改變了他人生的方向。不知道還有多少人，有著跟我一樣的故事。\n\n我一直把這句話帶在身邊：\n\n「那些瘋狂到以為自己能改變世界的人，才是真正改變世界的人。」\n\n還有好多值得做的東西。能讓我們全心投入的東西。能讓某個人感受到，我第一次看見那台 iMac 時那種感覺的東西。\n\n謝謝你，Steve。💛",
      "zh-CN": "我从小用的电脑，都是米色的方盒子。后来搬到加拿大，看见了 iMac G4。\n\n电脑怎么可以这么美？\n\n我买不起 Mac，就把自己的 PC 弄得像一台 Mac。换掉图示、字体、视窗。学会做那些亮晶晶、让人想舔一口的按钮。我就是这样走进介面设计的。看见了自己爱的东西，就想做出像那样的东西。\n\n我把 Steve 的发表会烧成 DVD，拿来研究。一遍又一遍地看。那些产品里有好多用心，向大家展示它们能做到什么的时候，又有好多喜悦。\n\n我的第一台 iPod 是黑色的 nano。走到哪都带着。然后 iPhone 出现了，改变了世界。\n\n那时候，感觉什么都有可能。\n\n他走了以后，我一直觉得我们卡在一个回圈里。不停地打磨。更好的供应链。更多让人一直滑下去的方法。那么多才华花在微小的改进上，留给真正伟大、发自内心的东西的空间，却那么少。\n\n发表会一年比一年更像电影。我还是很怀念现场展示。有个人站在台上，玩着自己参与做出来的东西。那种兴奋、那些玩笑、那些出包的时刻。很有人味。很好玩。\n\n我们让电脑更快。手机更薄。加了更多镜头。让机器在越来越多事情上比我们聪明。不知怎么的，我们也变得更疏离、更孤单了。\n\n我们花了好多力气想打败人类。我希望我们能多花点时间，从人们的生活里学习，让那些生活变得更好。\n\n工作的时候，我有时还是会想：Steve 会怎么做？\n\n我永远不会知道了。没能跟他一起工作，我很难过。但他的作品传到了一个用着米色 PC 的孩子手上，改变了他人生的方向。不知道还有多少人，有着跟我一样的故事。\n\n我一直把这句话带在身边：\n\n「那些疯狂到以为自己能改变世界的人，才是真正改变世界的人。」\n\n还有好多值得做的东西。能让我们全心投入的东西。能让某个人感受到，我第一次看见那台 iMac 时那种感觉的东西。\n\n谢谢你，Steve。💛",
      "en": "i grew up with beige boxes. then i moved to Canada and saw the iMac G4.\n\nhow can computers be so beautiful?\n\ni couldn’t afford a Mac, so i made my PC look like one. changed the icons, the fonts, the windows. learned to make those shiny, lickable buttons. that’s how i got into interface design. i saw something i loved and wanted to make things like it.\n\ni burned DVDs of Steve’s keynotes and studied them. watched them again and again. there was so much care in the products, and so much joy in showing people what they could do.\n\nmy first iPod was a black nano. i carried it everywhere. then the iPhone happened and changed the world.\n\nit felt like anything was possible.\n\nsince he died, i’ve felt us getting stuck in a loop. constant refinement. better supply chains. more ways to keep people scrolling. so much talent spent on tiny improvements, so little room for something truly great and heartfelt.\n\nthe keynotes get more cinematic every year. i still miss the live demos. someone onstage playing with something they helped make. the excitement, the jokes, the things that went wrong. it felt human. it was fun.\n\nwe made computers faster. phones thinner. added more cameras. made machines smarter than us at more and more things. somehow, we’ve also become more disconnected and lonely.\n\nwe spend so much energy trying to beat humans. i wish we spent more time learning from people’s lives and making them better.\n\nwhen i work, i still sometimes think: what would Steve do?\n\ni’ll never know. i’m sad i never got to work with him. but his work reached a kid with a beige PC and changed the course of his life. i wonder how many others have a story like mine.\n\ni’ve kept these words with me:\n\n“the people who are crazy enough to think they can change the world, are the ones who do.”\n\nthere’s still so much worth making. things we can put our hearts into. things that make someone feel what i felt when i first saw that iMac.\n\nthank you, Steve. 💛"
    },
    "photo": null,
    "x": 42,
    "y": 35,
    "w": 32,
    "rotate": 2
  },
  {
    "id": "feelings-photo",
    "dayId": "2026-10-17",
    "kind": "photo",
    "text": null,
    "photo": "/journal/light.jpg",
    "x": 2,
    "y": 30,
    "w": 26,
    "rotate": -2
  },
  {
    "id": "feelings-note",
    "dayId": "2026-10-17",
    "kind": "text",
    "text": {
      "zh-TW": "光從窗縫瞄進來\n窗邊的鳥鳴\n咖啡粉綻開\n\n檜木林裡慢慢走\n長吸一口氣 空氣涼涼的\n朦朧的雨滴 敲打著皮膚\n乘著浪\n無盡的海 鹽在唇上\n\n火車窗 山一路滑過\n牽著手跑著\n穿越黃燈\n熱了一整天後 泡進冷水\n你笑得像個小孩\n\n閉上眼\n聽我們最愛的歌\n依偎 親吻\n你的呼吸 緩落在我頸上\n聽見我的心碎\n\n一天一天 讓時間過去\n午夜到日出\n人生很美 本該就是這樣",
      "zh-CN": "光从窗缝瞄进来\n窗边的鸟鸣\n咖啡粉绽开\n\n桧木林里慢慢走\n长吸一口气 空气凉凉的\n朦胧的雨滴 敲打着皮肤\n乘着浪\n无尽的海 盐在唇上\n\n火车窗 山一路滑过\n牵着手跑着\n穿越黄灯\n热了一整天后 泡进冷水\n你笑得像个小孩\n\n闭上眼\n听我们最爱的歌\n依偎 亲吻\n你的呼吸 缓落在我颈上\n听见我的心碎\n\n一天一天 让时间过去\n午夜到日出\n人生很美 本该就是这样",
      "en": "light piercing through the blinds\nbirdsongs by the window\ncoffee grounds, blooming\n\nslow walk in the cypress forest\nlong breath, cold air\nfuzzy raindrops tap on the skin\ncatching the waves\nendless ocean, salt on the lips\n\ntrain window, mountains sliding by\nholding hands, running\nthrough the yellow light\ncold bath after a hot day\nmaking you laugh like a kid again\n\neyes closed\nlistening to our favorite songs\ncuddles and kisses\nyour breath slow on my neck\nhearing my heart break\n\nday by day, letting time pass\nmidnight to sunrise\nlife is beautiful, the way it is"
    },
    "photo": null,
    "x": 11,
    "y": 35,
    "w": 32,
    "rotate": 1
  },
  {
    "id": "struggle-note",
    "dayId": "2026-10-25",
    "kind": "text",
    "text": {
      "zh-TW": "我學習寫程式做設計，靠的是嘗試、失敗、再嘗試。\n\n碰壁了就想辦法爬過去。讀一些自己幾乎看不懂的東西。把問題拆開來研究，找人幫忙，從頭來過。\n\n剛開始工作的時候，我一直在做從沒做過的事。試著用不同的方法，讓新想法運轉起來。學不到東西了，就去找下一場掙扎。\n\n剛開始做了很多東西，都不夠好。但磨練過夠多輪，總有些什麼留了下來。曾經要花好大力氣的事，變成了我思考方式的一部分。可能用語言說不出為什麼，但就能感覺到哪裡不對。\n\n做事變得像水一樣。\n\n我回想這一路經歷了什麼。那個怎麼修都修不好的 bug。那個看起來沒問題、直到有人真的拿去用的設計。那場讓我看見自己缺點的對話。\n\n現在，我們可以去問機器了。\n\n我用這些工具做出了一些東西，要是沒有它們，我可能永遠都不會做。那些繁瑣的工作，我也不是每一件都懷念。但我在想，如果在弄懂困難教導了我們什麼之前，就先把困難去掉了，會發生什麼事？\n\n只要一問，結果就出現了。用起來還可以，就繼續向前。\n\n我們學會了怎麼得到結果，卻不一定懂它是怎麼運作的。因為結果看起來很完整，我們很容易錯過那些從來沒學會，要去問的問題。\n\n這件事還有另一面。\n\n跟人一起工作，是不舒服的。\n\n每個人想要的都不一樣。每個人都有你不知道的過去。有人在乎一個你覺得不重要的細節。你想往前走的時候，有人會反對。你很確定的時候，有人需要時間。\n\n要找到彼此，得花上一段時間。\n\n但一起掙扎過之後，你們就成了一個樂團。\n\n知道誰會注意到你漏掉的東西。誰能把一個想法拆開，又不把它弄死。什麼時候該加進來，什麼時候該放慢，什麼時候該讓別人來帶節奏。\n\n你們分享還沒完成的作品。承認自己不懂。傷了彼此，道歉，再試一次。最後，做出一個誰都沒辦法獨自做出來的東西。\n\n我最親近的幾段友誼，有些就是這樣一起工作出來的。聰明、在乎的人，看過我困惑、犯錯、疲憊、興奮的樣子。可以在他們面前示弱。用他們的想法改變了我。\n\n我擔心，我們正在讓人更容易避開那個開始。\n\nAgent 永遠都在。很有耐心，隨時準備繼續下去。跟它說話，可能比去靠近一個人還容易，那個人也許會誤解你、不同意你，或是正好有別的地方要去。\n\n有時候這種容易是有幫助的。但如果我們一直選擇機器，友誼要從哪裡開始？\n\n想像我們每個人都有自己的 Agent，自己的解釋，自己的小小世界。產出更多東西，卻越來越少理由離開螢幕，或跟另一個人一起把分歧邁過去。\n\n而這些世界，也不完全屬於我們。\n\n它們跑在伺服器農場裡的機器上，屬於某些公司，被我們未必看得見的利益塑造著。我們把自己的問題、自己的工作、自己的寂寞都給了它們。它們成了我們理解什麼是真實的一部分。\n\n這是自由嗎？\n\n還是一種舒適的囚禁，一切都在回應我們，但能真正觸動我們的東西卻越來越少？\n\n我不認為痛苦一定會讓一件事變好。有些掙扎，沒有人應該去承受。但我不想失去那種困難：去研究一樣陌生的東西，或去認識一個跟我不一樣的人。\n\n也許我們需要的工具，是幫我們花更多時間和這個世界連結在一起，而不是給我們更少理由走進去。讓人更容易找到彼此、分享還沒完成的東西、一起想通那些獨自想不通的事。\n\n有時候，我想關上筆電。\n\n跟我愛的人坐在一起，玩一首我們還沒摸透的曲子。彈錯一個音，掉了拍子，一直傾聽，直到我們再次找到彼此。\n\n像一個爵士樂團。每個人帶來不一樣的音符。沒有人知道我們最後會走到哪裡。\n\n我不想要沒有掙扎的人生。我想找到能一起掙扎的人。做一些我們能感受、能改變、能變成自己一部分的東西。\n\n一段我們誰都沒辦法獨自創作出來的音樂，而不是伺服器農場裡那片無聲的雜訊。",
      "zh-CN": "我学习写程式做设计，靠的是尝试、失败、再尝试。\n\n碰壁了就想办法爬过去。读一些自己几乎看不懂的东西。把问题拆开来研究，找人帮忙，从头来过。\n\n刚开始工作的时候，我一直在做从没做过的事。试着用不同的方法，让新想法运转起来。学不到东西了，就去找下一场挣扎。\n\n刚开始做了很多东西，都不够好。但磨练过够多轮，总有些什么留了下来。曾经要花好大力气的事，变成了我思考方式的一部分。可能用语言说不出为什么，但就能感觉到哪里不对。\n\n做事变得像水一样。\n\n我回想这一路经历了什么。那个怎么修都修不好的 bug。那个看起来没问题、直到有人真的拿去用的设计。那场让我看见自己缺点的对话。\n\n现在，我们可以去问机器了。\n\n我用这些工具做出了一些东西，要是没有它们，我可能永远都不会做。那些繁琐的工作，我也不是每一件都怀念。但我在想，如果在弄懂困难教导了我们什么之前，就先把困难去掉了，会发生什么事？\n\n只要一问，结果就出现了。用起来还可以，就继续向前。\n\n我们学会了怎么得到结果，却不一定懂它是怎么运作的。因为结果看起来很完整，我们很容易错过那些从来没学会，要去问的问题。\n\n这件事还有另一面。\n\n跟人一起工作，是不舒服的。\n\n每个人想要的都不一样。每个人都有你不知道的过去。有人在乎一个你觉得不重要的细节。你想往前走的时候，有人会反对。你很确定的时候，有人需要时间。\n\n要找到彼此，得花上一段时间。\n\n但一起挣扎过之后，你们就成了一个乐团。\n\n知道谁会注意到你漏掉的东西。谁能把一个想法拆开，又不把它弄死。什么时候该加进来，什么时候该放慢，什么时候该让别人来带节奏。\n\n你们分享还没完成的作品。承认自己不懂。伤了彼此，道歉，再试一次。最后，做出一个谁都没办法独自做出来的东西。\n\n我最亲近的几段友谊，有些就是这样一起工作出来的。聪明、在乎的人，看过我困惑、犯错、疲惫、兴奋的样子。可以在他们面前示弱。用他们的想法改变了我。\n\n我担心，我们正在让人更容易避开那个开始。\n\nAgent 永远都在。很有耐心，随时准备继续下去。跟它说话，可能比去靠近一个人还容易，那个人也许会误解你、不同意你，或是正好有别的地方要去。\n\n有时候这种容易是有帮助的。但如果我们一直选择机器，友谊要从哪里开始？\n\n想像我们每个人都有自己的 Agent，自己的解释，自己的小小世界。产出更多东西，却越来越少理由离开萤幕，或跟另一个人一起把分歧迈过去。\n\n而这些世界，也不完全属于我们。\n\n它们跑在伺服器农场里的机器上，属于某些公司，被我们未必看得见的利益塑造着。我们把自己的问题、自己的工作、自己的寂寞都给了它们。它们成了我们理解什么是真实的一部分。\n\n这是自由吗？\n\n还是一种舒适的囚禁，一切都在回应我们，但能真正触动我们的东西却越来越少？\n\n我不认为痛苦一定会让一件事变好。有些挣扎，没有人应该去承受。但我不想失去那种困难：去研究一样陌生的东西，或去认识一个跟我不一样的人。\n\n也许我们需要的工具，是帮我们花更多时间和这个世界连结在一起，而不是给我们更少理由走进去。让人更容易找到彼此、分享还没完成的东西、一起想通那些独自想不通的事。\n\n有时候，我想关上笔电。\n\n跟我爱的人坐在一起，玩一首我们还没摸透的曲子。弹错一个音，掉了拍子，一直倾听，直到我们再次找到彼此。\n\n像一个爵士乐团。每个人带来不一样的音符。没有人知道我们最后会走到哪里。\n\n我不想要没有挣扎的人生。我想找到能一起挣扎的人。做一些我们能感受、能改变、能变成自己一部分的东西。\n\n一段我们谁都没办法独自创作出来的音乐，而不是伺服器农场里那片无声的杂讯。",
      "en": "i learned programming and design by trying, failing, and trying again.\n\nwhen i hit a wall, i figured out how to climb it. read something i barely understood. took things apart. asked someone for help. started over.\n\nwhen i began my career, i kept doing things i had never done before. trying different ways to make something work. when i stopped learning, i moved on to the next struggle.\n\nmany things i made weren’t very good. but after enough rounds, something stuck. what once took so much effort became part of how i thought. i could feel something was wrong before i knew how to explain it.\n\nit became like water.\n\ni think about what went into that. the bug i couldn’t fix. the design that looked right until someone used it. the conversation that made me realize my flaws.\n\nnow we can ask a machine.\n\ni’ve made things with these tools that i might never have made otherwise. i don’t miss every tedious task. but i wonder what happens when we remove the difficulty before we understand what it was teaching us.\n\nwe ask. something appears. it works well enough. we move on.\n\nwe learn how to get results without necessarily understanding how it works. and because the result looks complete, it becomes easy to miss the questions we never learned to ask.\n\nthere is another side to this.\n\nworking with people is uncomfortable.\n\neveryone wants something different. everyone has a history you don’t know. someone cares about a detail you think is unimportant. someone pushes back when you want to move. someone needs time when you feel certain.\n\nit takes a while to find each other.\n\nbut sometimes, after struggling together, you become a band.\n\nyou know who notices what you miss. who can pull an idea apart without killing it. when to step in, when to slow down, when to let someone else carry the rhythm.\n\nyou share something unfinished. admit you don’t know. hurt each other, apologize, try again. eventually you make something none of you could have made alone.\n\nsome of my closest friendships came from working this way. smart, caring humans who saw me confused, wrong, tired, excited. people i could be vulnerable with. people whose ideas changed mine.\n\ni worry we are making it easier to avoid that beginning.\n\nan agent is always there. patient. ready to keep going. talking to it can feel easier than reaching toward someone who might misunderstand you, disagree, or have somewhere else to be.\n\nsometimes that ease helps. but if we keep choosing it, where do the friendships begin?\n\ni picture each of us with our own agents. our own explanations. our own little worlds. making more things, with fewer reasons to leave the screen or work through a difference with another person.\n\nand these worlds aren’t entirely ours.\n\nthey run on machines in server farms, owned by companies, shaped by interests we may not see. we bring them our questions, our work, our loneliness. they become part of how we understand what is real.\n\nis that freedom?\n\nor a comfortable kind of confinement, where everything responds to us but fewer things reach us?\n\ni don’t think pain makes something good. there are struggles nobody should have to endure. but i don’t want to lose the difficulty of learning something unfamiliar, or getting to know someone who isn’t like me.\n\nmaybe we need tools that help us spend more time with the world, instead of giving us fewer reasons to enter it. tools that make it easier to find people, share something unfinished, and work through what we couldn’t figure out alone.\n\nsometimes i want to close the laptop.\n\nsit with people i love. play something we haven’t figured out yet. miss a note, lose the rhythm, listen until we find each other again.\n\nlike a jazz band. everyone bringing something different. nobody knowing where we’ll end up.\n\ni don’t want a life without struggle. i want people to struggle with. something we can feel, change, and make our own.\n\nmusic we couldn’t have made alone, instead of the silent static of the server farm."
    },
    "photo": null,
    "x": 33,
    "y": 16,
    "w": 32,
    "rotate": 1
  },
  {
    "id": "intellect-note",
    "dayId": "2026-10-29",
    "kind": "text",
    "text": {
      "zh-TW": "剛開始做軟體的時候，我夢想的不是一座工廠。\n\n我喜歡的是，螢幕上的東西可以變成我思緒的延伸。一個在我還沒想通之前，就能先把想法放下來的地方。把東西搬來搬去，直到新的連結浮現。做一些照著我的方式運作的小系統，就算別人都看不懂也沒關係。\n\n電腦有趣，不是因為它可以不靠我就把事情做完。而是因為我可以用它做到的事。\n\n早期的電腦發展，就是圍繞著這種可能性建立起來的。1962 年，Engelbart 這樣描述擴增人類智慧：幫助一個人理解複雜的處境，找到原本遙不可及的解法。他的出發點是人，不是自主運作的機器。\n\n他描述的不是一個更快的黑箱。他看的是一整段關係：一個人，和他的工具、他的語言、他的方法，還有他能學會用這些做到什麼。能力屬於這整個系統。\n\n不知道從什麼時候開始，我們用一個小得多的故事，去講一項強大得多的技術。\n\n更多自動化。更多 AI 代理。更多軟體產出更多軟體。更少的人，更多的產出。更多增長。更多數字，來證明有什麼正在發生。\n\n而這一切原本要服務的那個人，得到的關注卻越來越少。\n\n我不想假裝電腦的起點有多純真。取代人力，本來就是它的野心之一。不過早在 1960 年，Licklider 就把人機共生，和另一種系統區分開來：在那種系統裡，剩下的人主要是在服務機器。他希望電腦能參與想法的形成，而不只是執行早就定義好的問題。\n\n這個區別很重要——系統是在幫你發現自己想表達的是什麼？還是只想要你送出一個請求，然後在外面等它做完？\n\n有時候，等待正是我想要的。請幫我搜尋。幫我搬檔案。把重複的工作拿走。\n\n但不是每一件困難的事，都是多餘的負擔。\n\n有時候，把碎片搬來搬去，就是理解它們的方式。有時候，動手做這件東西，會改變你原本想做的東西。有時候，你需要看到錯的版本，摸摸它，把它拆開，才找到一個更好的問題。\n\n我想要能為這種關係留下空間的工具。\n\n在 1981 年那篇關於 Smalltalk 的論文裡，Ingalls 描述了一個系統，是為了支持每個人的創造精神。個人的掌握很重要：一個人應該能理解這個系統，而不是永遠依賴一個自己碰不到的東西。\n\n他也主張，電腦模型應該配合人的心智，而不是反過來要人去配合。\n\n不是一套適合每個人的完美流程。而是不同的人，可以用不同方式住進去的系統。有人靠圖像思考。有人需要寫下來。有人靠做模擬來理解問題。有人整理生活的方式，一點都不像 SaaS 的儀表板。\n\n一個能隨著你的理解改變，被你重新塑造的系統。\n\n這就是我希望 AI 能帶來的可能。不只是大量產出軟體，而是跟軟體有一段活生生的關係。可以問它為什麼這樣運作。改掉一部分，而不用交出其餘的部分。看看發生了什麼，重做，學到足夠的東西，下一次自己動手改。\n\n機器可以變得更強，也不讓人變得更渺小。\n\n但這不會只因為模型變好就自然發生。我們必須在乎。為人而設計。當我們讓人變得更依賴，卻說這是在賦予人力量的時候，要能察覺。\n\n我不想只用沒有人也能完成多少工作，來衡量未來。\n\n我想知道，那些以前沒辦法參與的人，現在有什麼變得可能了。\n\n他們現在能理解什麼？能表達什麼？不用請求許可，就能改變什麼？\n\n當我說擴增人類智慧，我指的就是這個。\n\n不是一個不再需要我們的世界。\n而是一個我們更有能力去塑造的世界。",
      "zh-CN": "刚开始做软体的时候，我梦想的不是一座工厂。\n\n我喜欢的是，萤幕上的东西可以变成我思绪的延伸。一个在我还没想通之前，就能先把想法放下来的地方。把东西搬来搬去，直到新的连结浮现。做一些照着我的方式运作的小系统，就算别人都看不懂也没关系。\n\n电脑有趣，不是因为它可以不靠我就把事情做完。而是因为我可以用它做到的事。\n\n早期的电脑发展，就是围绕着这种可能性建立起来的。1962 年，Engelbart 这样描述扩增人类智慧：帮助一个人理解复杂的处境，找到原本遥不可及的解法。他的出发点是人，不是自主运作的机器。\n\n他描述的不是一个更快的黑箱。他看的是一整段关系：一个人，和他的工具、他的语言、他的方法，还有他能学会用这些做到什么。能力属于这整个系统。\n\n不知道从什么时候开始，我们用一个小得多的故事，去讲一项强大得多的技术。\n\n更多自动化。更多 AI 代理。更多软体产出更多软体。更少的人，更多的产出。更多增长。更多数字，来证明有什么正在发生。\n\n而这一切原本要服务的那个人，得到的关注却越来越少。\n\n我不想假装电脑的起点有多纯真。取代人力，本来就是它的野心之一。不过早在 1960 年，Licklider 就把人机共生，和另一种系统区分开来：在那种系统里，剩下的人主要是在服务机器。他希望电脑能参与想法的形成，而不只是执行早就定义好的问题。\n\n这个区别很重要——系统是在帮你发现自己想表达的是什么？还是只想要你送出一个请求，然后在外面等它做完？\n\n有时候，等待正是我想要的。请帮我搜寻。帮我搬档案。把重复的工作拿走。\n\n但不是每一件困难的事，都是多余的负担。\n\n有时候，把碎片搬来搬去，就是理解它们的方式。有时候，动手做这件东西，会改变你原本想做的东西。有时候，你需要看到错的版本，摸摸它，把它拆开，才找到一个更好的问题。\n\n我想要能为这种关系留下空间的工具。\n\n在 1981 年那篇关于 Smalltalk 的论文里，Ingalls 描述了一个系统，是为了支持每个人的创造精神。个人的掌握很重要：一个人应该能理解这个系统，而不是永远依赖一个自己碰不到的东西。\n\n他也主张，电脑模型应该配合人的心智，而不是反过来要人去配合。\n\n不是一套适合每个人的完美流程。而是不同的人，可以用不同方式住进去的系统。有人靠图像思考。有人需要写下来。有人靠做模拟来理解问题。有人整理生活的方式，一点都不像 SaaS 的仪表板。\n\n一个能随着你的理解改变，被你重新塑造的系统。\n\n这就是我希望 AI 能带来的可能。不只是大量产出软体，而是跟软体有一段活生生的关系。可以问它为什么这样运作。改掉一部分，而不用交出其余的部分。看看发生了什么，重做，学到足够的东西，下一次自己动手改。\n\n机器可以变得更强，也不让人变得更渺小。\n\n但这不会只因为模型变好就自然发生。我们必须在乎。为人而设计。当我们让人变得更依赖，却说这是在赋予人力量的时候，要能察觉。\n\n我不想只用没有人也能完成多少工作，来衡量未来。\n\n我想知道，那些以前没办法参与的人，现在有什么变得可能了。\n\n他们现在能理解什么？能表达什么？不用请求许可，就能改变什么？\n\n当我说扩增人类智慧，我指的就是这个。\n\n不是一个不再需要我们的世界。\n而是一个我们更有能力去塑造的世界。",
      "en": "when i started making software, i wasn’t dreaming of a factory.\n\ni loved that something on a screen could become an extension of my mind. a place to put a thought before i understood it. to move things around until new connections appeared. to make little systems that worked the way i worked, even if it made no sense to anyone else.\n\nthe computer wasn’t interesting because it could do work without me. it was interesting because of what i could do with it.\n\nthe early lineage of computing was built around this possibility. in 1962, Engelbart described augmenting human intellect as helping a person understand complex situations and find solutions that were previously out of reach. his starting point was the human being, not the autonomous machine.\n\nhe wasn’t describing a faster black box. he was looking at the whole relationship between a person, their tools, their language, their methods, and what they could learn to do with them. the capability belonged to that whole system.\n\nsomewhere along the way, we started telling a much smaller story about a much more powerful technology.\n\nmore automation. more agents. more software producing more software. more output from fewer people. more growth. more numbers to prove that something is happening.\n\nand less attention to the person any of this is supposed to be for.\n\ni don’t want to pretend computing had a pure innocent beginning. replacing human labor was one of its ambitions. even in 1960, Licklider distinguished human-computer symbiosis from systems where the remaining people mainly served the machine. he wanted computers to participate in the formation of ideas, not only execute problems already defined.\n\nthat distinction feels important – does the system help you discover what you mean? or does it only want you to submit a request, and wait outside while it works?\n\nsometimes waiting is exactly what i want. please do the search. move the files. take away the repetitive work.\n\nbut not everything difficult is overhead.\n\nsometimes moving the pieces around is how you understand them. sometimes making the thing changes what you wanted to make. sometimes you need to see the wrong version, touch it, take it apart, and discover a better question.\n\ni want tools that leave room for that relationship.\n\nin his 1981 paper on Smalltalk, Ingalls described a system meant to support everyone’s creative spirit. personal mastery mattered: an individual should be able to comprehend the system, rather than remain dependent on something permanently beyond their reach.\n\nhe also argued that computer models should fit the human mind, rather than demand the reverse.\n\nnot one perfect workflow for everyone. systems that different people can inhabit differently. someone who thinks through pictures. someone who needs to write. someone who understands a problem by building a simulation. someone whose way of organizing their life doesn’t resemble a SaaS dashboard.\n\na system you can reshape as your understanding changes.\n\nthis is what i want AI to make possible. not just pumping out software, but having a living relationship with it. being able to ask why something works this way. change one part without surrendering the rest. see what happened. undo it. learn enough to make the next change yourself.\n\nthe machine can become more capable without making the person smaller.\n\nbut that won’t happen just because we make the models better. we have to care about it. design for it. notice when we are making someone more dependent while calling it empowerment.\n\ni don’t want to measure the future only by how much work happens without us.\n\ni want to know what becomes possible for the person who couldn’t participate before.\n\nwhat can they understand now? what can they express? what can they change without asking permission?\n\nwhen i say augmenting human intellect, that is what i mean.\n\nnot a world that no longer needs us.\na world we have more ability to shape."
    },
    "photo": null,
    "x": 2,
    "y": 16,
    "w": 32,
    "rotate": -1
  },
  {
    "id": "big-boy-photo",
    "dayId": "2026-10-30",
    "kind": "photo",
    "text": null,
    "photo": "/journal/tea.jpg",
    "x": 33,
    "y": 2,
    "w": 26,
    "rotate": -2
  },
  {
    "id": "big-boy-note",
    "dayId": "2026-10-30",
    "kind": "text",
    "text": {
      "zh-TW": "胸口發燙 背脊發涼\n心懸在崖邊 準備墜落\n在無愛的太空飄浮 只剩我 和幾個陌生靈魂\n戴著笑臉 打聲招呼「最近好嗎？」\n「還不錯 你呢？」\n\n日子照樣過 失了控\n一行淚滑落 沒人看見\n視線模糊 被思緒淹沒\n大人的世界 好奇怪\n\n我問心底的小孩 你為什麼活著？\n他想都沒想過\n他在結冰的河上滑來滑去 咯咯地笑\n他唱歌 他玩耍 他畫畫\n他飛進未知 什麼都不怕 什麼都好奇\n他閉上眼睛 就看見了奇蹟\n\n像水 沒有形狀\n像白紙 沒有規則\n\n「怎麼哭了 大男孩？」\n「你還是我啊 我也還是你」",
      "zh-CN": "胸口发烫 背脊发凉\n心悬在崖边 准备坠落\n在无爱的太空飘浮 只剩我 和几个陌生灵魂\n戴着笑脸 打声招呼「最近好吗？」\n「还不错 你呢？」\n\n日子照样过 失了控\n一行泪滑落 没人看见\n视线模糊 被思绪淹没\n大人的世界 好奇怪\n\n我问心底的小孩 你为什么活着？\n他想都没想过\n他在结冰的河上滑来滑去 咯咯地笑\n他唱歌 他玩耍 他画画\n他飞进未知 什么都不怕 什么都好奇\n他闭上眼睛 就看见了奇迹\n\n像水 没有形状\n像白纸 没有规则\n\n「怎么哭了 大男孩？」\n「你还是我啊 我也还是你」",
      "en": "warm tension, cold chills\nheart hanging off a cliff, ready to free fall\nfloating in space with no love, just me and some stranger souls\nwearing smiles and greet “How are you?”\n“I’m good, you?”\n\nlife carries on, unhinged\na tear slips, no one noticed\nvision blurs, drowned in thoughts\nwhat a strange grown-up world\n\ni asked my inner child, why do you live?\nhe has never thought about it\nhe slid on the cold iced river, amused\nhe sang, he played, he drew\nhe flew into the unknown, fearless, curious\nhe closed his eyes and saw wonders\n\nlike water, with no shape\nlike paper, clear of rules\n\n“Why cry, big boy?”\n“You are still me, and I’m still you.”"
    },
    "photo": null,
    "x": 42,
    "y": 7,
    "w": 32,
    "rotate": 2
  },
  {
    "id": "love-note",
    "dayId": "2026-11-06",
    "kind": "text",
    "text": {
      "zh-TW": "當我真正開始愛自己\n我才認識到\n所有的痛苦和情感的折磨\n都只是提醒我\n活著 不要違背自己的本心\n今天我明白了 這叫做「真實」\n\n當我真正開始愛自己\n我才懂得\n把自己的願望強加於人\n是多麼的無禮\n就算我知道 時機並不成熟\n那人也還沒有做好準備\n就算那個人就是我自己\n今天我明白了 這叫做「尊重」\n\n當我真正開始愛自己\n我不再渴求不同的人生\n我知道任何發生在我身邊的事情\n都是對我成長的邀請\n如今 我稱之為「成熟」\n\n當我真正開始愛自己\n我才明白 我其實一直都在正確的時間\n正確的地方 發生的一切都恰如其分\n由此我得以平靜\n今天我明白了 這叫做「自信」\n\n當我真正開始愛自己\n我不再犧牲自己的自由時間\n不再去勾畫什麼宏偉的明天\n今天我只做有趣和快樂的事\n做自己熱愛 讓心歡喜的事\n用我的方式 以我的韻律\n今天我明白了 這叫做「單純」\n\n當我真正開始愛自己\n我開始遠離一切不健康的東西\n不論是飲食和人物 還是事情和環境\n我遠離一切讓我遠離本真的東西\n從前我把這叫「追求健康的自私自利」\n但今天我明白了 這是「自愛」\n\n當我真正開始愛自己\n我不再總想著要永遠真確 不犯錯誤\n我今天明白了 這叫做「謙遜」\n\n當我真正開始愛自己\n我不再繼續沉溺於過去\n也不再為明天而憂慮\n現在我只活在一切正在發生的當下\n今天 我活在此時此地\n如此日復一日 這就叫「完美」\n\n當我真正開始愛自己\n我明白 我的思慮讓我變得貧乏和病態\n但當我喚起了心靈的力量\n理智就變成了一個重要的伙伴\n這種組合我稱之為「心的智慧」\n\n我們無需害怕自己和其他人的分歧\n矛盾和問題\n因為即使星星有時也會碰在一起\n形成新的世界\n今天我明白\n這就是「生命」\n\nKim & Alison McMillen",
      "zh-CN": "当我真正开始爱自己\n我才认识到\n所有的痛苦和情感的折磨\n都只是提醒我\n活着 不要违背自己的本心\n今天我明白了 这叫做「真实」\n\n当我真正开始爱自己\n我才懂得\n把自己的愿望强加于人\n是多么的无礼\n就算我知道 时机并不成熟\n那人也还没有做好准备\n就算那个人就是我自己\n今天我明白了 这叫做「尊重」\n\n当我真正开始爱自己\n我不再渴求不同的人生\n我知道任何发生在我身边的事情\n都是对我成长的邀请\n如今 我称之为「成熟」\n\n当我真正开始爱自己\n我才明白 我其实一直都在正确的时间\n正确的地方 发生的一切都恰如其分\n由此我得以平静\n今天我明白了 这叫做「自信」\n\n当我真正开始爱自己\n我不再牺牲自己的自由时间\n不再去勾画什么宏伟的明天\n今天我只做有趣和快乐的事\n做自己热爱 让心欢喜的事\n用我的方式 以我的韵律\n今天我明白了 这叫做「单纯」\n\n当我真正开始爱自己\n我开始远离一切不健康的东西\n不论是饮食和人物 还是事情和环境\n我远离一切让我远离本真的东西\n从前我把这叫「追求健康的自私自利」\n但今天我明白了 这是「自爱」\n\n当我真正开始爱自己\n我不再总想着要永远真确 不犯错误\n我今天明白了 这叫做「谦逊」\n\n当我真正开始爱自己\n我不再继续沉溺于过去\n也不再为明天而忧虑\n现在我只活在一切正在发生的当下\n今天 我活在此时此地\n如此日复一日 这就叫「完美」\n\n当我真正开始爱自己\n我明白 我的思虑让我变得贫乏和病态\n但当我唤起了心灵的力量\n理智就变成了一个重要的伙伴\n这种组合我称之为「心的智慧」\n\n我们无需害怕自己和其他人的分歧\n矛盾和问题\n因为即使星星有时也会碰在一起\n形成新的世界\n今天我明白\n这就是「生命」\n\nKim & Alison McMillen",
      "en": "as i began to love myself\ni found that anguish and emotional suffering\nare only warning signs that i was living against my own truth\ntoday, i know, this is authenticity\n\nas i began to love myself\ni understood how much it can offend somebody\nas i try to force my desires on this person\neven though i knew the time was not right\nand the person was not ready for it\nand even though this person was me\ntoday i call it respect\n\nas i began to love myself\ni stopped craving for a different life\nand i could see that everything that surrounded me\nwas inviting me to grow\ntoday i call it maturity\n\nas i began to love myself\ni understood that at any circumstance\ni am in the right place at the right time\nand everything happens at the exactly right moment\nso i could be calm\ntoday i call it self-confidence\n\nas i began to love myself\ni quit steeling my own time\nand i stopped designing huge projects for the future\ntoday, i only do what brings me joy and happiness\nthings i love to do and that make my heart cheer\nand i do them in my own way and in my own rhythm\ntoday i call it simplicity\n\nas i began to love myself\ni freed myself of anything that is no good for my health\nfood, people, things, situations\nand everything that drew me down and away from myself\nat first i called this attitude a healthy egoism\ntoday i know it is love of oneself\n\nas i began to love myself\ni quit trying to always be right\nand ever since i was wrong less of the time\ntoday i discovered that is modesty\n\nas i began to love myself\ni refused to go on living in the past\nand worry about the future\nnow, i only live for the moment\nwhere everything is happening\ntoday i live each day, day by day\nand i call it fulfillment\n\nas i began to love myself\ni recognized that my mind can disturb me\nand it can make me sick\nbut as i connected it to my heart\nmy mind became a valuable ally\ntoday i call this connection wisdom of the heart\n\nwe no longer need to fear arguments, confrontations\nor any kind of problems with ourselves or others\neven stars collide\nand out of their crashing new worlds are born\ntoday i know that is life\n\nKim & Alison McMillen"
    },
    "photo": null,
    "x": 2,
    "y": 2,
    "w": 32,
    "rotate": -2
  }
];
