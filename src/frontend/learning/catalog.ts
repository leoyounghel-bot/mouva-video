export type Copy = readonly [string, string];
export type LessonAction =
  | "canvas"
  | "storyboard"
  | "timeline"
  | "agent"
  | "takes"
  | "images"
  | "assets"
  | "native"
  | "third-shot"
  | "slow-third"
  | "title"
  | "export"
  | "practice";
export type LessonStep = {
  title: Copy;
  body: Copy;
  tasks: Copy[];
  tip?: Copy;
  image?: string;
  action?: LessonAction;
  actionLabel?: Copy;
};
export type Course = {
  id: string;
  category: "basics" | "generation" | "editing" | "case";
  icon: string;
  title: Copy;
  description: Copy;
  minutes: number;
  steps: LessonStep[];
};
export const courses: Course[] = [
  {
    id: "canvas",
    category: "basics",
    icon: "canvas",
    minutes: 4,
    title: ["画布与节点", "Canvas and nodes"],
    description: [
      "移动画布、连接素材，理解三个同步视图。",
      "Navigate the canvas, connect media and work across three synced views.",
    ],
    steps: [
      {
        title: ["先熟悉三个视图", "Meet the three views"],
        body: [
          "故事板梳理镜头，画布展开创作分支，时间线组合成片。它们使用同一个项目。",
          "Storyboard organizes shots, Canvas explores branches, and Timeline assembles the film. All three use the same project.",
        ],
        tasks: [
          [
            "点击顶部的故事板、Canvas和时间线，观察同一个镜头。",
            "Switch between Storyboard, Canvas and Timeline and find the same shot.",
          ],
          [
            "选择一个镜头，留意右侧内容随选择改变。",
            "Select a shot and watch the sidebar follow your selection.",
          ],
        ],
        action: "canvas",
        actionLabel: ["去画布试一试", "Try the canvas"],
      },
      {
        title: ["移动画布与单个节点", "Move the canvas or one node"],
        body: [
          "拖动空白处平移整张画布。拖动节点标题或非控件区域，只移动该节点。",
          "Drag empty space to pan the canvas. Drag a node title or a non-control area to move that node alone.",
        ],
        tasks: [
          [
            "先拖空白处，再拖一个节点，比较两种移动。",
            "Drag empty space, then drag a node and compare the results.",
          ],
          [
            "苹果鼠标滑动平移，Control配合拖动或滚动缩放。",
            "With a Magic Mouse, swipe to pan; hold Control while dragging or scrolling to zoom.",
          ],
          [
            "普通滚轮缩放；Shift+滚轮左右移动。",
            "A standard mouse wheel zooms; Shift + wheel pans horizontally.",
          ],
        ],
      },
      {
        title: ["让输入与镜头联系起来", "Keep the prompt attached to its shot"],
        body: [
          "选中视频节点后，描述框出现在它下方。先确认选中了哪个镜头，再写生成要求。",
          "Select a video node to reveal its prompt composer below. Check the selected shot before describing the next result.",
        ],
        tasks: [
          [
            "点击视频节点，找到下方的输入框。",
            "Select a video node and locate the composer below it.",
          ],
          [
            "填写主体、动作和镜头要求；先检查模型与参数，再决定是否提交。",
            "Describe the subject, action and camera. Check model settings before deciding to submit.",
          ],
        ],
        tip: [
          "查看教程与填写描述不会自动提交生成。",
          "Reading the lesson or entering a prompt does not submit a generation.",
        ],
      },
    ],
  },
  {
    id: "images",
    category: "generation",
    icon: "image",
    minutes: 3,
    title: ["图片与素材", "Images and assets"],
    description: [
      "生成参考图，或导入已有素材到当前项目。",
      "Generate visual references or import existing media into your project.",
    ],
    steps: [
      {
        title: ["整理已有素材", "Organize existing media"],
        body: [
          "在素材库集中管理图片、视频、音频与模型。已有素材可以直接用于练习。",
          "Assets keeps images, video, audio and models together. Existing media is enough to start practicing.",
        ],
        tasks: [
          [
            "进入素材库，导入文件并查看类型筛选。",
            "Open Assets, import a file and try the type filters.",
          ],
          [
            "选中目标镜头，再添加相关的参考素材。",
            "Select the target shot before attaching its references.",
          ],
        ],
        action: "assets",
        actionLabel: ["打开素材库", "Open Assets"],
      },
      {
        title: ["生成视觉参考", "Generate a visual reference"],
        body: [
          "图片生成在Studio内打开。把主体、构图、灯光和风格写清楚，再检查生成参数。",
          "Image generation opens inside Studio. Describe the subject, composition, lighting and style, then review generation settings.",
        ],
        tasks: [
          [
            "写一个清楚的参考图描述。",
            "Write a clear reference-image description.",
          ],
          [
            "核对模型和尺寸；点击生成之前确认费用。",
            "Review the model and size, and check the cost before generating.",
          ],
        ],
        action: "images",
        actionLabel: ["打开图片生成", "Open image generation"],
        tip: [
          "这个入口只打开设置，不会自动调用模型。",
          "This action opens settings only; it does not call a model.",
        ],
      },
      {
        title: ["让参考服务于故事", "Use references to support the story"],
        body: [
          "给角色和场景使用稳定的参考，并说明要保留哪些特征。",
          "Use consistent character and scene references, and specify which traits should stay.",
        ],
        tasks: [
          [
            "为角色记录服装、发型、武器和色彩。",
            "Record costume, hairstyle, weapon and colors for each character.",
          ],
          [
            "下一轮只改一个问题，保留其余设定。",
            "Change one issue in the next iteration and retain the other decisions.",
          ],
        ],
      },
    ],
  },
  {
    id: "agent",
    category: "editing",
    icon: "spark",
    minutes: 4,
    title: ["Agent与即时剪辑", "Agent and quick edits"],
    description: [
      "用控件改速度，用自然语言表达复杂修改。",
      "Change speed with controls and describe more involved edits in natural language.",
    ],
    steps: [
      {
        title: ["先确定编辑对象", "Choose the edit target"],
        body: [
          "Agent跟随当前选中的镜头。预览候选与编辑已采用版本是不同操作。",
          "Agent follows the selected shot. Previewing a candidate and editing the adopted version are separate actions.",
        ],
        tasks: [
          ["选中一个镜头，确认其名称。", "Select a shot and confirm its name."],
          [
            "如果控件不可用，先回到已采用版本。",
            "If edit controls are disabled, return to the adopted take.",
          ],
        ],
        action: "agent",
        actionLabel: ["打开编辑Agent", "Open editing Agent"],
      },
      {
        title: ["不用模型，也能改速度", "Change speed without a model call"],
        body: [
          "在编辑模式的即时剪辑中选择播放速度。0.75倍会放慢动作并延长片段。",
          "Choose Playback speed in Edit mode's quick controls. A speed of 0.75 slows the action and lengthens the clip.",
        ],
        tasks: [
          ["把一个镜头设为0.75倍并播放。", "Set a shot to 0.75× and play it."],
          [
            "用撤销与重做比较变化。",
            "Use Undo and Redo to compare the change.",
          ],
        ],
        tip: [
          "即时剪辑直接修改项目，不调用AI；自然语言编辑会调用已配置模型。",
          "Quick controls edit the project directly without AI. Natural-language editing uses the configured model.",
        ],
      },
      {
        title: ["写清修改边界", "Define the scope of an edit"],
        body: [
          "指令要包括目标、参数和保留项。例如：只把当前镜头设为0.75倍，不改裁剪范围。",
          "Include the target, parameter and constraints. For example: Set only the current shot to 0.75×; keep the trim range unchanged.",
        ],
        tasks: [
          [
            "检查自动应用编辑开关，决定先看提案还是直接应用。",
            "Check Auto-apply edits to choose whether to review a plan first.",
          ],
          [
            "修改后检查画面、时长与声音。",
            "After applying, check the picture, duration and sound.",
          ],
        ],
      },
    ],
  },
  {
    id: "takes",
    category: "generation",
    icon: "layers",
    minutes: 4,
    title: ["候选卡组与迭代", "Candidates and iteration"],
    description: [
      "比较、收藏、采用；保留满意版本再探索。",
      "Compare, favorite and adopt while keeping a version you like.",
    ],
    steps: [
      {
        title: ["预览与采用分开", "Preview before adopting"],
        body: [
          "预览用于比较，采用才会把版本同步到剪辑。先保留满意版本，再继续探索。",
          "Previewing is for comparison. Adopting sends a take into the edit. Keep a version you like before exploring further.",
        ],
        tasks: [
          [
            "打开候选卡组并播放现有结果。",
            "Open Candidates and play an existing result.",
          ],
          [
            "收藏喜欢的版本，并记录具体问题。",
            "Favorite a take you like and record a specific issue.",
          ],
        ],
        action: "takes",
        actionLabel: ["打开候选卡组", "Open Candidates"],
      },
      {
        title: ["让下一轮有所依据", "Make the next iteration specific"],
        body: [
          "一次只处理一个问题：角色一致、动作自然、构图或运镜。模型结果有波动，比较能帮助你选择。",
          "Address one issue at a time: character continuity, motion, framing or camera movement. Model outputs vary; comparison helps you choose.",
        ],
        tasks: [
          [
            "写成“保持主体与服装，只减慢运镜”。",
            "Write: Keep the subjects and costumes; only slow the camera movement.",
          ],
          [
            "查看生成参数，再决定要不要生成新候选。",
            "Review generation settings before deciding to create another take.",
          ],
        ],
        tip: [
          "查看、收藏和采用现有候选不会生成新视频；提交新任务会产生模型调用。",
          "Viewing, favoriting or adopting existing takes creates no new video. Submitting a new job calls a model.",
        ],
      },
      {
        title: ["采用后检查成片", "Check the edit after adoption"],
        body: [
          "新候选的长度与声音可能不同。采用后要重新检查裁剪范围和时间线。",
          "A new take may differ in length or sound. Recheck the trim range and timeline after adoption.",
        ],
        tasks: [
          [
            "确认采用标记，播放完整片段。",
            "Confirm the adopted marker and play the entire clip.",
          ],
          [
            "在时间线查看镜头衔接与音轨。",
            "Check transitions and audio on the Timeline.",
          ],
        ],
        action: "timeline",
        actionLabel: ["查看时间线", "View Timeline"],
      },
    ],
  },
  {
    id: "native",
    category: "generation",
    icon: "box",
    minutes: 5,
    title: ["3D动作到视频", "From 3D motion to video"],
    description: [
      "分清场景、运动参考与最终视频三个阶段。",
      "Understand the scene, motion reference and finished-video stages.",
    ],
    steps: [
      {
        title: ["先得到可编辑场景", "Start with an editable scene"],
        body: [
          "3D保存物体、相机与运动；MP4保存渲染后的画面。生成场景后，先检查主体与机位。",
          "3D stores objects, cameras and motion. MP4 stores rendered frames. Check subjects and camera placement after creating a scene.",
        ],
        tasks: [
          [
            "选中带有3D候选的镜头，打开编辑3D。",
            "Select a shot with a 3D take and open Edit 3D.",
          ],
          [
            "播放与拖动进度，检查完整动作。",
            "Play and scrub through the complete action.",
          ],
        ],
        action: "native",
        actionLabel: ["查看当前3D场景", "Inspect the current 3D scene"],
      },
      {
        title: ["渲染运动参考", "Render a motion reference"],
        body: [
          "运动参考把3D的动作与摄影变成可播放的视频。先看参考，修正问题后再进行下一步。",
          "A motion reference turns the 3D motion and camera into a playable video. Review and fix it before the next stage.",
        ],
        tasks: [
          [
            "检查角色是否在画面内，接触动作是否清楚。",
            "Check that characters stay visible and contacts are understandable.",
          ],
          [
            "检查时长、节奏和镜头方向。",
            "Review duration, pacing and camera direction.",
          ],
        ],
      },
      {
        title: ["生成最终视频", "Generate a finished video"],
        body: [
          "运动参考流程需要可供视频模型读取的发布服务。纯文字生成是另一条路径。",
          "The motion-reference workflow needs a publishing service the video model can access. Text-to-video is a separate route.",
        ],
        tasks: [
          [
            "在服务设置中确认运动参考发布已配置。",
            "Confirm motion-reference publishing in Service settings.",
          ],
          [
            "检查参数与费用，再提交最终视频。",
            "Review settings and cost before submitting the finished video.",
          ],
        ],
        tip: [
          "雨门双锋的真人版独立通过文字生成，不是把GLB转换成真人视频。",
          "Rain Gate's live-action-style sample was generated from text separately; it was not converted from the GLB.",
        ],
      },
    ],
  },
  {
    id: "export",
    category: "editing",
    icon: "download",
    minutes: 3,
    title: ["字幕、声音与导出", "Titles, sound and export"],
    description: [
      "检查全片，保存视频和可继续编辑的项目。",
      "Review the full film and save both the video and editable project.",
    ],
    steps: [
      {
        title: ["让标题避开主体", "Keep titles clear of the subject"],
        body: [
          "用即时剪辑添加字幕，然后调整出现时间与位置。",
          "Add a title with quick edit controls, then adjust its timing and position.",
        ],
        tasks: [
          [
            "选择第一镜头并添加标题。",
            "Select the first shot and add a title.",
          ],
          [
            "预览字幕，不遮挡脸部与重要动作。",
            "Preview the text so it avoids faces and key action.",
          ],
        ],
        action: "agent",
        actionLabel: ["打开字幕编辑", "Open title editing"],
      },
      {
        title: ["检查声音与整段节奏", "Review sound and pacing"],
        body: [
          "视频可能已有声音。不要再叠加同一条音轨，否则音乐和音效会重复。",
          "Video may already contain sound. Adding the same track again duplicates music and effects.",
        ],
        tasks: [
          [
            "播放完整时间线，听衔接、音量和结尾。",
            "Play the entire timeline and listen to transitions, volume and the ending.",
          ],
          [
            "改变播放速度后，再听一次声音。",
            "Listen again after changing playback speed.",
          ],
        ],
        action: "timeline",
        actionLabel: ["检查完整时间线", "Review the full timeline"],
      },
      {
        title: ["保存成片与项目", "Save the film and project"],
        body: [
          "在导出窗口选择格式、分辨率、帧率与画幅。导出后再保存项目JSON，便于继续编辑。",
          "Choose format, resolution, frame rate and aspect ratio in Export. Save the project JSON too, so you can keep editing.",
        ],
        tasks: [
          [
            "720p素材练习可选择MP4、720p、24帧和16:9。",
            "For the 720p practice media, use MP4, 720p, 24 fps and 16:9.",
          ],
          [
            "检查是否包含音频与字幕，再点击导出。",
            "Review audio and text inclusion before exporting.",
          ],
          [
            "下载MP4，并在项目菜单保存项目文件。",
            "Download the MP4 and save the project file from the project menu.",
          ],
        ],
        action: "export",
        actionLabel: ["打开导出设置", "Open export settings"],
      },
    ],
  },
  {
    id: "wuxia",
    category: "case",
    icon: "video",
    minutes: 15,
    title: ["雨门·双锋：双人武打短片", "Rain Gate: a two-fighter short"],
    description: [
      "用已完成的8镜头素材，练习速度、标题与导出。",
      "Practice speed, titles and export with an eight-shot finished sequence.",
    ],
    steps: [
      {
        title: [
          "看成片，打开练习项目",
          "Watch the film and open the practice project",
        ],
        body: [
          "我们已经完成12秒真人风格AI样片与32秒3D动画。它们分别制作，使用相同的角色与故事设定。",
          "The case includes a 12-second AI sample and a 32-second 3D animation, produced separately from the same character and story brief.",
        ],
        tasks: [
          [
            "先看画布教程里的两段样片。",
            "Watch both samples in the canvas lessons.",
          ],
          [
            "打开练习项目，应看到8个画布节点，组成32秒成片。",
            "Open the practice project: eight canvas nodes form a 32-second film.",
          ],
        ],
        action: "practice",
        actionLabel: ["打开练习项目", "Open practice project"],
      },
      {
        title: ["设定两位角色", "Define the two characters"],
        body: [
          "青衣使用深蓝长袍与银色护腕，赤衣使用暗红长袍与金色护腕。明确差异，方便连续镜头中辨认。",
          "Blue wears a navy robe and silver wrist guards; Red wears a dark-red robe and gold guards. Distinct traits help continuity across shots.",
        ],
        tasks: [
          [
            "记录服装、武器、发型和初始站位。",
            "Record costume, weapon, hairstyle and starting position.",
          ],
          [
            "把一轮动作写成进攻、格挡、反击、回到架势。",
            "Describe a round as attack, parry, counter and reset.",
          ],
        ],
        image: "ai-poster.jpg",
      },
      {
        title: ["分镜让攻防看得清楚", "Make the exchange readable"],
        body: [
          "对峙建立位置，攻防展示全身，反攻改变节奏，锁锋收束故事。提交的动作节奏与模型结果可能不同。",
          "The standoff establishes positions, full-body exchanges show motion, the counter changes pace, and locked blades close the story. Model timing can differ from the brief.",
        ],
        tasks: [
          [
            "在故事板查看8个镜头的标题与裁剪范围。",
            "Check the eight shots and their trim ranges in Storyboard.",
          ],
          [
            "在动作段保持两人可见，并留下对手反应。",
            "Keep both fighters visible and include the opponent's response.",
          ],
        ],
        image: "storyboard.jpg",
        action: "storyboard",
        actionLabel: ["查看案例故事板", "View the case storyboard"],
      },
      {
        title: ["提示词写成六个部分", "Write a six-part prompt"],
        body: [
          "时长画幅、角色、场景、分段动作、摄影、声音。12秒短片只安排几次清楚的攻防。",
          "Specify duration and format, characters, setting, timed actions, camera and sound. Keep the twelve-second exchange focused.",
        ],
        tasks: [
          [
            "例如：两名成年剑客雨夜交锋，青衣斜劈、赤衣格挡反击，结尾双剑交叉。",
            "Example: Two adult fighters duel in a rainy courtyard. Blue slashes, Red parries and counters, and the ending locks their blades.",
          ],
          [
            "注明服装与面孔保持一致，双人全身可见，脚踩实地面。",
            "Specify consistent faces and costumes, both bodies visible and feet grounded.",
          ],
        ],
        tip: [
          "本教程使用已有结果，打开案例不会重新提交模型生成。",
          "The lesson uses completed results. Opening the case does not submit a new generation.",
        ],
      },
      {
        title: ["动画在可编辑GLB里", "The animation lives in the GLB"],
        body: [
          "这次3D动作由程序编排，并导出78条动画轨道。当前GLB将双人和庭院放在一个模型节点里。",
          "The 3D choreography was programmed and exported as 78 animation tracks. Both fighters and the courtyard are bundled in one model node.",
        ],
        tasks: [
          [
            "预览原生3D候选，并打开编辑3D。",
            "Preview the native 3D take and open Edit 3D.",
          ],
          [
            "可改整体变换、相机和播放速度；单独重排招式需要修改动作源码或GLB。",
            "Edit overall transforms, camera and speed here; individual choreography needs changes to the source or GLB.",
          ],
        ],
        image: "native-preview.png",
        action: "native",
        actionLabel: ["查看案例3D动画", "View the case 3D animation"],
        tip: [
          "先预览，不自动采用原生版本；电影版仍保留在剪辑中。",
          "This previews the native take without adopting it. The rendered version stays in the edit.",
        ],
      },
      {
        title: ["把第三个镜头设为0.75倍", "Slow the third shot to 0.75×"],
        body: [
          "第三镜头使用原视频9.6—14.4秒，原长4.8秒。0.75倍后是6.4秒；其余镜头不变时，全片33.6秒。",
          "Shot three uses source seconds 9.6–14.4, or 4.8 seconds. At 0.75× it lasts 6.4 seconds; with other shots unchanged, the film lasts 33.6 seconds.",
        ],
        tasks: [
          [
            "选择第三镜头，切回已采用的电影版。",
            "Select shot three and return to the adopted rendered take.",
          ],
          [
            "点击下方按钮设置速度，再播放检查。",
            "Use the button below to set speed, then play to review.",
          ],
          [
            "试一次撤销与重做，观察时长恢复。",
            "Try Undo and Redo and watch the duration update.",
          ],
        ],
        action: "slow-third",
        actionLabel: ["将第三镜头设为0.75倍", "Set shot three to 0.75×"],
      },
      {
        title: ["比较与采用候选", "Compare and adopt candidates"],
        body: [
          "案例里的电影版与原生版是不同制作格式，不能当成同一提示词的两次抽卡。预览与采用分开。",
          "The rendered and native takes are different production formats, not rerolls of the same prompt. Previewing and adopting are separate.",
        ],
        tasks: [
          [
            "播放两个现有候选，比较画面与动作。",
            "Play both existing takes and compare picture and motion.",
          ],
          [
            "本次剪辑练习保留带有声音的3D电影版。",
            "Keep the rendered 3D version with embedded audio for this exercise.",
          ],
        ],
        action: "takes",
        actionLabel: ["打开案例候选卡组", "Open case candidates"],
      },
      {
        title: ["添加标题，再检查声音", "Add a title and check sound"],
        body: [
          "原视频已有片名，再添加“第一幕 · 雨夜对峙”作为章节标题。电影版MP4已经包含配乐与刀剑音效。",
          "The original video already has a title. Add “Act I · Standoff” as a chapter heading. The rendered MP4 includes music and sword effects.",
        ],
        tasks: [
          [
            "在右上方添加章节标题，检查文字没有遮挡人物。",
            "Add the chapter heading at the top right and check it avoids the characters.",
          ],
          [
            "播放全片，不重复叠加原有音轨。",
            "Play the film without duplicating the embedded soundtrack.",
          ],
        ],
        action: "title",
        actionLabel: [
          "给第一镜头添加章节标题",
          "Add a chapter heading to shot one",
        ],
      },
      {
        title: ["导出你的练习版", "Export your practice version"],
        body: [
          "选择MP4、720p、24帧与16:9，保留音频和字幕。导出后保存修改过的项目。",
          "Use MP4, 720p, 24 fps and 16:9, including audio and text. Save the edited project after exporting.",
        ],
        tasks: [
          [
            "仅第三镜头改为0.75倍时，总时长应约33.6秒。",
            "If only shot three was slowed, the total should be about 33.6 seconds.",
          ],
          [
            "导出视频并保存项目JSON。",
            "Export the video and save the project JSON.",
          ],
          [
            "练习后可返回原项目，也可继续编辑练习副本。",
            "Return to your original project afterward, or keep editing the practice copy.",
          ],
        ],
        action: "export",
        actionLabel: ["打开练习版导出设置", "Open export settings"],
      },
    ],
  },
];
export const courseById = (id: string) => courses.find((c) => c.id === id);
