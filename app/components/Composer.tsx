"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

/* ───────── Types ───────── */

export interface AttachmentFile {
  id: string;
  type: "character" | "style" | "scene" | "text";
  name: string;
  icon: string;
  file?: File;
  preview?: string;
}

export interface ComposerSettings {
  pages: string;
  style: string;
  styleLabel: string;
  age: string;
  lang: string;
}

interface ComposerProps {
  onSubmit: (concept: string, settings: ComposerSettings, files: AttachmentFile[]) => void;
  loading?: boolean;
  genStep: number;
  showModal: boolean;
}

/* ───────── Constants ───────── */

const INSPIRATIONS = [
  "一只总把袜子穿反的小恐龙，第一天去恐龙幼儿园",
  "云朵工厂里的失败品——一朵会下糖果的云",
  "城市夜晚，街灯们偷偷换班去看月亮",
  "一只想学游泳的乌龟，向章鱼老师拜师",
  "图书馆深夜，故事书里的角色互相串门",
  "一个不喜欢光的萤火虫，只爱发明黑色的灯",
  "外婆的老花镜里住着一个小裁缝",
  "数字 7 觉得自己太孤单，去找其它数字交朋友",
  "一只会做梦的茶壶，每天早上把梦倒给它的主人喝",
  "森林邮局的新邮差是一片落叶",
];

const ATTACH_META: Record<
  string,
  { icon: string; label: string; sub: string; accept?: string }
> = {
  character: { icon: "👤", label: "角色参考", sub: "让主角长得像 TA", accept: "image/*" },
  style: { icon: "🎨", label: "画风参考", sub: "指定一种插画风格", accept: "image/*" },
  scene: { icon: "🏞", label: "场景参考", sub: "特定的环境或地点", accept: "image/*" },
  text: { icon: "📄", label: "故事文本", sub: "已有的大纲或童谣", accept: ".txt,.md,.docx" },
};

const STYLE_CARDS = [
  { key: "watercolor", label: "水彩", bg: "linear-gradient(135deg, #fcd34d 0%, #f87171 50%, #c084fc 100%)" },
  { key: "3d", label: "3D", bg: "linear-gradient(135deg, #60a5fa 0%, #34d399 50%, #fbbf24 100%)" },
  { key: "ink", label: "水墨", bg: "linear-gradient(135deg, #1f2937 0%, #6b7280 50%, #f3f4f6 100%)" },
  {
    key: "pixel",
    label: "像素",
    bg: "linear-gradient(45deg, #f472b6 25%, #818cf8 25%, #818cf8 50%, #f472b6 50%, #f472b6 75%, #818cf8 75%)",
    bgSize: "12px 12px",
  },
];

const COVER_EXAMPLES = [
  {
    title: "月光下的小兔",
    prompt: "一只小兔子坐着萤火虫做的飞船去月球，给妈妈摘一颗星星当礼物",
    icon: "🐰",
    g1: "#1e3a8a",
    g2: "#7c3aed",
    g3: "#f9a8d4",
  },
  {
    title: "勇敢的菜菜",
    prompt: "森林里所有动物都怕黑，只有小猫菜菜想去找到夜晚的源头",
    icon: "🐱",
    g1: "#064e3b",
    g2: "#10b981",
    g3: "#fde68a",
  },
  {
    title: "糖果世界",
    prompt: "小女孩推开了厨房橱柜的门，里面竟然是一整个糖果做的城市",
    icon: "🍭",
    g1: "#9d174d",
    g2: "#f472b6",
    g3: "#fef3c7",
  },
  {
    title: "会画画的机器人",
    prompt: "一个被丢弃的扫地机器人，捡到一支画笔，开始记录它看到的世界",
    icon: "🤖",
    g1: "#0c4a6e",
    g2: "#0ea5e9",
    g3: "#bae6fd",
  },
];

const GEN_STEPS = [
  "解析故事概念",
  "设计角色与画风",
  "生成每一页画面",
  "添加文字与动效",
  "合成配乐",
];

/* ───────── SVG Icons ───────── */

const IconAttach = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

const IconSettings = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
    <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
    <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
    <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
    <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" />
    <line x1="17" y1="16" x2="23" y2="16" />
  </svg>
);

const IconBulb = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
    <path d="M9 18h6" /><path d="M10 22h4" />
    <path d="M12 2a7 7 0 0 0-7 7c0 2.5 1.4 4.7 3.5 5.8.3.2.5.5.5.9V18h7v-2.3c0-.4.2-.7.5-.9C18.6 13.7 20 11.5 20 9a7 7 0 0 0-7-7z" />
  </svg>
);

const IconSend = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
  </svg>
);

const IconPerson = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
    <circle cx="12" cy="8" r="4" /><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2" />
  </svg>
);

const IconPalette = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
    <circle cx="13.5" cy="6.5" r="0.5" /><circle cx="17.5" cy="10.5" r="0.5" />
    <circle cx="8.5" cy="7.5" r="0.5" /><circle cx="6.5" cy="12.5" r="0.5" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
  </svg>
);

const ImageIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </svg>
);

const DocIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const ATTACH_ICONS: Record<string, () => ReactNode> = {
  character: IconPerson,
  style: IconPalette,
  scene: ImageIcon,
  text: DocIcon,
};

/* ───────── Segmented Control ───────── */

function SegGroup({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-[3px] bg-[#f3f4f6] p-[3px] rounded-[10px]">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`flex-1 px-2.5 py-1.5 rounded-[7px] text-[13px] cursor-pointer transition-all font-[inherit] ${
            value === opt
              ? "bg-white text-[#111827] shadow-[0_1px_3px_rgba(0,0,0,0.08)] font-medium"
              : "bg-transparent text-[#6b7280] hover:text-[#374151]"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

/* ───────── Cover Card SVG ───────── */

function CoverSVG({ icon, g1, g2, g3, title }: { icon: string; g1: string; g2: string; g3: string; title: string }) {
  // Use a deterministic ID based on icon to avoid re-render issues with Math.random()
  const id = `cg-${icon}-${title}`;
  return (
    <svg viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" className="w-full h-full block">
      <defs>
        <radialGradient id={id} cx="50%" cy="35%" r="85%">
          <stop offset="0%" stopColor={g3} />
          <stop offset="55%" stopColor={g2} />
          <stop offset="100%" stopColor={g1} />
        </radialGradient>
      </defs>
      <rect width="120" height="160" fill={`url(#${id})`} />
      <circle cx="90" cy="32" r="13" fill="rgba(255,255,255,0.22)" />
      <circle cx="25" cy="115" r="8" fill="rgba(255,255,255,0.15)" />
      <text x="60" y="105" textAnchor="middle" fontSize="42">{icon}</text>
      <text x="60" y="135" textAnchor="middle" fontSize="10" fill="white" fontWeight="700" fontFamily="-apple-system, sans-serif" letterSpacing="0.5">{title}</text>
    </svg>
  );
}

/* ───────── Toast ───────── */

function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-7 left-1/2 -translate-x-1/2 bg-[#111827] text-white px-[18px] py-[11px] rounded-xl text-[13.5px] z-[100] shadow-[0_12px_32px_rgba(0,0,0,0.2)] toast-visible pointer-events-none">
      {message}
    </div>
  );
}

/* ───────── Generation Modal ───────── */

function GenModal({ step }: { step: number }) {
  return (
    <div className="fixed inset-0 bg-[rgba(17,24,39,0.45)] backdrop-blur-[8px] flex items-center justify-center z-[200] modal-backdrop-enter">
      <div className="bg-white rounded-3xl px-12 py-10 max-w-[460px] w-[90%] text-center modal-content-enter">
        {/* Conic spinner */}
        <div className="w-[60px] h-[60px] rounded-full conic-spinner mx-auto mb-5 relative">
          <div className="absolute inset-[6px] bg-white rounded-full" />
        </div>
        <h3 className="text-[19px] font-semibold mb-1.5">正在生成你的绘本</h3>
        <p className="text-[13.5px] text-[#6b7280]">这可能需要 30–60 秒，AI 正在分镜和绘制…</p>

        {/* Steps */}
        <div className="mt-6 text-left bg-[#fafafa] rounded-xl px-4 py-3.5">
          {GEN_STEPS.map((label, i) => {
            const isDone = i < step;
            const isActive = i === step;
            return (
              <div
                key={i}
                className={`flex items-center gap-3 py-[5px] text-[13px] transition-colors ${
                  isDone ? "text-[#111827]" : isActive ? "text-[#a855f7] font-medium" : "text-[#9ca3af]"
                }`}
              >
                <div
                  className={`w-[14px] h-[14px] rounded-full shrink-0 transition-all ${
                    isDone
                      ? "bg-[#10b981] border-[#10b981] relative"
                      : isActive
                      ? "border-[#a855f7] bg-white shadow-[inset_0_0_0_3px_#a855f7] step-pulse"
                      : "border-[#d1d5db]"
                  } border-2`}
                >
                  {isDone && (
                    <div className="absolute left-[3px] top-[0.5px] w-[3px] h-[6px] border-solid border-white border-0 border-r-[1.5px] border-b-[1.5px] rotate-45" />
                  )}
                </div>
                {label}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ───────── Main Composer ───────── */

export default function Composer({ onSubmit, loading, genStep, showModal }: ComposerProps) {
  /* State */
  const [text, setText] = useState("");
  const [files, setFiles] = useState<AttachmentFile[]>([]);
  const [settings, setSettings] = useState<ComposerSettings>({
    pages: "5",
    style: "watercolor",
    styleLabel: "水彩",
    age: "3–6",
    lang: "中文",
  });
  const [openPopover, setOpenPopover] = useState<"attach" | "settings" | null>(null);
  const [toast, setToast] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingAttachType = useRef<string | null>(null);
  const lastInspirationIdx = useRef(-1);

  /* Derived */
  const canSend = text.trim().length > 0 || files.length > 0;

  /* Toast helper */
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }, []);

  /* Auto-resize textarea */
  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 240) + "px";
  }, []);

  /* Close popovers */
  const closePopovers = useCallback((except?: string | null) => {
    if (except !== "attach") setOpenPopover((prev) => (prev === "attach" ? null : prev));
    if (except !== "settings") setOpenPopover((prev) => (prev === "settings" ? null : prev));
  }, []);

  const togglePopover = useCallback(
    (name: "attach" | "settings") => {
      setOpenPopover((prev) => (prev === name ? null : name));
    },
    []
  );

  /* Settings summary */
  const settingsSummary = `${settings.pages} 页 · ${settings.styleLabel} · ${settings.age} 岁`;

  /* Handlers */
  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    setTimeout(autoResize, 0);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape") {
      setOpenPopover(null);
    }
  };

  const handleSend = () => {
    if (!canSend || loading) {
      if (!canSend) showToast("先输入故事概念，或上传一张参考图");
      return;
    }
    onSubmit(text.trim(), settings, files);
  };

  /* Attachment */
  const handleAttachClick = (type: string) => {
    pendingAttachType.current = type;
    const meta = ATTACH_META[type];
    if (meta?.accept) {
      // For image types, open file picker
      const input = fileInputRef.current;
      if (input) {
        input.accept = meta.accept;
        input.click();
      }
    }
    setOpenPopover(null);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const type = pendingAttachType.current || "character";
    const meta = ATTACH_META[type];
    const newFile: AttachmentFile = {
      id: `${type}-${Date.now()}`,
      type: type as AttachmentFile["type"],
      name: file.name,
      icon: meta.icon,
      file,
    };
    // Generate preview for images
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        newFile.preview = reader.result as string;
        setFiles((prev) => [...prev, newFile]);
      };
      reader.readAsDataURL(file);
    } else {
      setFiles((prev) => [...prev, newFile]);
    }
    showToast(`已添加${meta.label}`);
    // Reset input
    e.target.value = "";
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  /* Inspiration */
  const handleInspire = () => {
    let idx: number;
    do {
      idx = Math.floor(Math.random() * INSPIRATIONS.length);
    } while (idx === lastInspirationIdx.current && INSPIRATIONS.length > 1);
    lastInspirationIdx.current = idx;
    setText(INSPIRATIONS[idx]);
    setTimeout(autoResize, 0);
    textareaRef.current?.focus();
    showToast("✨ 灵感来了！不喜欢可以再点一次");
  };

  /* Cover click */
  const handleCoverClick = (prompt: string) => {
    setText(prompt);
    setTimeout(autoResize, 0);
    textareaRef.current?.focus();
    showToast("已填入故事概念，按 ⌘+Enter 发送");
  };

  /* Global click-outside & Esc */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // If click is outside any popover trigger or popover content, close all
      if (
        !target.closest("[data-popover-trigger]") &&
        !target.closest("[data-popover-content]")
      ) {
        setOpenPopover(null);
      }
    };
    const keyHandler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpenPopover(null);
    };
    document.addEventListener("click", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("click", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, []);

  /* Expose setGenStep & setShowModal for parent */
  // We use a ref-based approach: parent calls via a callback
  // For simplicity, we'll use a prop-based approach in the integration

  return (
    <>
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />

      {/* Toast */}
      <Toast message={toast} />

      {/* Generation Modal */}
      {showModal && <GenModal step={genStep} />}

      {/* ─── Composer Container ─── */}
      <div className="mt-10 relative">
        <div className="composer-container bg-white border border-[#e5e7eb] rounded-3xl shadow-[0_4px_24px_rgba(168,85,247,0.07)] transition-[border-color,box-shadow] duration-200">
          {/* Attachment chips */}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pt-3.5">
              {files.map((f) => (
                <div
                  key={f.id}
                  className="inline-flex items-center gap-2 px-2 py-1 pl-1 bg-[#f5f3ff] border border-[#e9d5ff] rounded-full text-[13px] text-[#6b21a8]"
                  style={{ animation: "chip-in 0.2s ease" }}
                >
                  <div className="w-[22px] h-[22px] rounded-full bg-[linear-gradient(135deg,#a855f7,#ec4899)] grid place-items-center text-white text-xs shrink-0">
                    {f.preview ? (
                      <img src={f.preview} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      f.icon
                    )}
                  </div>
                  <span className="max-w-[120px] truncate">{f.name}</span>
                  <button
                    onClick={() => removeFile(f.id)}
                    className="bg-transparent border-none cursor-pointer text-[#6b21a8] opacity-40 hover:opacity-100 px-1 text-base leading-none"
                    aria-label="移除"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="给我讲一个故事…例如：「小兔子去月球上找妈妈」"
            rows={2}
            className="composer-textarea w-full border-none outline-none resize-none px-5 pt-4 pb-2 text-base leading-[1.5] bg-transparent text-[#111827] min-h-[88px] max-h-[240px] placeholder:text-[#9ca3af]"
          />

          {/* Toolbar */}
          <div className="flex items-center justify-between px-2.5 pb-2.5 gap-2">
            {/* Left tools */}
            <div className="flex items-center gap-0.5">
              {/* Attach */}
              <div className="relative" data-popover-trigger>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePopover("attach");
                  }}
                  className={`w-[34px] h-[34px] rounded-[9px] border-none cursor-pointer grid place-items-center transition-all duration-150 ${
                    openPopover === "attach"
                      ? "bg-[#f3e8ff] text-[#7e22ce]"
                      : "bg-transparent text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]"
                  }`}
                  aria-label="添加参考"
                  title="添加参考"
                  aria-expanded={openPopover === "attach"}
                  aria-haspopup="true"
                >
                  <IconAttach />
                </button>

                {/* Attach popover */}
                {openPopover === "attach" && (
                  <div
                    data-popover-content
                    role="menu"
                    aria-label="附件类型"
                    className="absolute bottom-[calc(100%+10px)] left-0 bg-white border border-[#e5e7eb] rounded-[14px] shadow-[0_16px_48px_rgba(0,0,0,0.14)] p-2 min-w-[260px] z-20"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {Object.entries(ATTACH_META).map(([type, meta]) => {
                      const IconComp = ATTACH_ICONS[type];
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => handleAttachClick(type)}
                          className="flex items-center gap-3 p-2 px-2.5 rounded-lg cursor-pointer transition-colors w-full text-left hover:bg-[#faf5ff] text-[14px] text-[#111827]"
                        >
                          <div className="w-[34px] h-[34px] rounded-lg bg-[linear-gradient(135deg,#f3e8ff,#fce7f3)] grid place-items-center text-[#a855f7] shrink-0">
                            <IconComp />
                          </div>
                          <div>
                            <div className="font-medium leading-tight">{meta.label}</div>
                            <div className="text-[12px] text-[#6b7280] mt-0.5">{meta.sub}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Settings */}
              <div className="relative" data-popover-trigger>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePopover("settings");
                  }}
                  className={`w-[34px] h-[34px] rounded-[9px] border-none cursor-pointer grid place-items-center transition-all duration-150 ${
                    openPopover === "settings"
                      ? "bg-[#f3e8ff] text-[#7e22ce]"
                      : "bg-transparent text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]"
                  }`}
                  aria-label="设置"
                  title="设置"
                  aria-expanded={openPopover === "settings"}
                  aria-haspopup="true"
                >
                  <IconSettings />
                </button>

                {/* Settings popover */}
                {openPopover === "settings" && (
                  <div
                    data-popover-content
                    role="dialog"
                    aria-label="生成设置"
                    className="absolute bottom-[calc(100%+10px)] left-0 bg-white border border-[#e5e7eb] rounded-[14px] shadow-[0_16px_48px_rgba(0,0,0,0.14)] p-4 min-w-[340px] z-20"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Pages */}
                    <div className="mb-4">
                      <div className="text-[11px] font-semibold text-[#6b7280] uppercase tracking-[0.05em] mb-2">
                        页数
                      </div>
                      <SegGroup
                        options={["3", "5", "8", "12"]}
                        value={settings.pages}
                        onChange={(v) => setSettings((s) => ({ ...s, pages: v }))}
                      />
                    </div>

                    {/* Style */}
                    <div className="mb-4">
                      <div className="text-[11px] font-semibold text-[#6b7280] uppercase tracking-[0.05em] mb-2">
                        画风
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {STYLE_CARDS.map((sc) => (
                          <button
                            key={sc.key}
                            type="button"
                            onClick={() =>
                              setSettings((s) => ({ ...s, style: sc.key, styleLabel: sc.label }))
                            }
                            className={`aspect-square rounded-[9px] border-2 cursor-pointer relative overflow-hidden transition-all hover:scale-[1.04] p-0 ${
                              settings.style === sc.key ? "border-[#a855f7]" : "border-transparent"
                            }`}
                            style={{
                              background: sc.bg,
                              backgroundSize: sc.bgSize || undefined,
                            }}
                            aria-label={`选择${sc.label}画风`}
                            aria-pressed={settings.style === sc.key}
                          >
                            <div className="absolute bottom-1 left-1 right-1 text-[10.5px] text-white bg-[rgba(0,0,0,0.45)] px-1 py-0.5 rounded-[5px] text-center backdrop-blur-[4px] font-medium">
                              {sc.label}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Age */}
                    <div className="mb-4">
                      <div className="text-[11px] font-semibold text-[#6b7280] uppercase tracking-[0.05em] mb-2">
                        受众
                      </div>
                      <SegGroup
                        options={["0–3", "3–6", "6–9", "9+"].map((v) => `${v}${v === "9+" ? "" : ""}`)}
                        value={settings.age}
                        onChange={(v) => setSettings((s) => ({ ...s, age: v }))}
                      />
                    </div>

                    {/* Language */}
                    <div>
                      <div className="text-[11px] font-semibold text-[#6b7280] uppercase tracking-[0.05em] mb-2">
                        语言
                      </div>
                      <SegGroup
                        options={["中文", "English", "日本語"]}
                        value={settings.lang}
                        onChange={(v) => setSettings((s) => ({ ...s, lang: v }))}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Inspiration */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenPopover(null);
                  handleInspire();
                }}
                className="w-[34px] h-[34px] rounded-[9px] border-none bg-transparent text-[#6b7280] cursor-pointer grid place-items-center transition-all duration-150 hover:bg-[#f3f4f6] hover:text-[#111827] active:scale-[0.94]"
                aria-label="给我一个灵感"
                title="给我一个灵感"
              >
                <IconBulb />
              </button>

              {/* Settings summary pill */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePopover("settings");
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 ml-1 bg-[#f9fafb] border border-[#e5e7eb] rounded-full text-[12.5px] text-[#6b7280] cursor-pointer transition-all hover:bg-[#f3f4f6] hover:border-[#d1d5db] hover:text-[#111827] font-[inherit] max-sm:hidden"
              >
                {settingsSummary}
              </button>
            </div>

            {/* Right: Send button */}
            <div>
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend || loading}
                className={`w-[34px] h-[34px] rounded-[9px] border-none grid place-items-center transition-all duration-200 ${
                  canSend && !loading
                    ? "bg-[linear-gradient(135deg,#a855f7,#ec4899)] text-white cursor-pointer shadow-[0_4px_12px_rgba(168,85,247,0.35)] hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(168,85,247,0.45)]"
                    : "bg-[#e5e7eb] text-[#9ca3af] cursor-not-allowed"
                }`}
                aria-label="发送"
                title="发送 (⌘ + Enter)"
              >
                <IconSend />
              </button>
            </div>
          </div>
        </div>

        {/* Hints */}
        <div className="flex items-center justify-center gap-4 mt-3.5 text-[12px] text-[#9ca3af]">
          <span>
            <kbd className="inline-block px-1.5 py-px bg-[#f3f4f6] border border-[#e5e7eb] rounded-[5px] text-[11px] font-mono text-[#6b7280]">
              ⌘
            </kbd>{" "}
            +{" "}
            <kbd className="inline-block px-1.5 py-px bg-[#f3f4f6] border border-[#e5e7eb] rounded-[5px] text-[11px] font-mono text-[#6b7280]">
              Enter
            </kbd>{" "}
            发送
          </span>
          <span>·</span>
          <span>支持中英文与图片参考</span>
        </div>
      </div>

      {/* ─── Cover Gallery ─── */}
      <div className="mt-16">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[13px] text-[#6b7280] font-medium tracking-[0.02em]">
            看看别人创作的绘本
          </h3>
          <button className="bg-transparent border-none text-[#a855f7] text-[13px] cursor-pointer font-medium font-[inherit] hover:text-[#ec4899]">
            查看完整画廊 →
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {COVER_EXAMPLES.map((c) => (
            <div
              key={c.title}
              className="cursor-pointer transition-transform duration-200 hover:-translate-y-1"
              onClick={() => handleCoverClick(c.prompt)}
            >
              <div className="aspect-[3/4] rounded-xl overflow-hidden relative shadow-[0_6px_20px_rgba(0,0,0,0.1)] mb-3">
                <CoverSVG icon={c.icon} g1={c.g1} g2={c.g2} g3={c.g3} title={c.title} />
              </div>
              <h4 className="text-sm font-semibold text-[#111827] mb-1">{c.title}</h4>
              <p className="text-xs text-[#6b7280] leading-[1.45] line-clamp-2">{c.prompt}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
