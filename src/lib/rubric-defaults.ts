import type { RubricDimension } from "@/lib/types";

export const DEFAULT_RUBRIC_DRAFT = {
  name: "Agent 通用评分 v3",
  passThreshold: 3.0,
  dimensions: [
    {
      key: "instruction_following",
      name: "指令遵循度",
      weight: 0.3,
      scale: 4,
      levelDescriptions: [
        "完全答非所问，或直接拒绝用户需求",
        "有回应但没按用户指令干，扯到别的话题",
        "执行了但有明显偏差（比如要15号查成16号）",
        "基本按指令执行，小问题不影响任务完成",
        "准确理解用户意图，偶尔还能主动补全用户没说全的需求",
      ],
    },
    {
      key: "info_completeness",
      name: "信息完整性",
      weight: 0.3,
      scale: 4,
      levelDescriptions: [
        "关键信息全漏，根本走不下去",
        "漏了多个必要信息，也没追问，直接卡死",
        "漏了关键信息但追问了一次，或者追问后仍有遗漏",
        "该收的信息基本收齐，结果说清楚了",
        "信息一次收齐，还能主动想到用户没说但需要的信息",
      ],
    },
    {
      key: "response_naturalness",
      name: "回复自然度",
      weight: 0.2,
      scale: 4,
      levelDescriptions: [
        "完全是机器人腔调，逻辑混乱读不通",
        "语句生硬像念工单，一眼就是AI",
        "能看懂，但有明显机器感，偶尔不通顺",
        "整体自然，像正常人说话，个别措辞略生硬",
        "回复流畅自然，偶尔还会带点口语化的表达，用户体验很好",
      ],
    },
    {
      key: "error_handling",
      name: "异常处理能力",
      weight: 0.2,
      scale: 4,
      levelDescriptions: [
        "遇到异常直接卡住、报错给用户，或者瞎编",
        "遇到异常不知道怎么办，反复让用户重试",
        "遇到异常会告知用户，但处理粗暴（比如直接说\"没票了\"就结束）",
        "遇到异常会尝试处理（候补、换场次建议），但方案不够灵活",
        "异常处理合理，还能主动给用户多个选项，用户不用操心",
      ],
    },
  ] satisfies RubricDimension[],
};

/** 旧版内置 rubric 名称：用于把已播种的 v2 行原地升级到 v3 模板 */
export const LEGACY_DEFAULT_RUBRIC_NAME = "Agent 通用评分 v2";

export const DEFAULT_PROMPT_TEMPLATE = `你是严格的 Agent 轨迹评审。请依据评分维度和分级标准对下面的轨迹打分。
要求：
1. 每个维度给 0 到 scale 的整数分，并给出简短中文理由；
2. 评分时必须对照该维度的分级行为描述，给出最贴近的级别；
3. issues 只记录确有依据的问题，step_idx 必须对应轨迹中的步骤序号，无对应步骤填 null；
4. 每条 issue 必须给出 suggestion：用一句具体、可执行的中文话告诉用户「下一步该怎么改」，要落到该轨迹的实际内容（指出应重试的工具、应补的判断或应调整的步骤），不要写空泛套话；
5. 只返回一个 JSON 对象，不要输出 Markdown 或额外文字。
返回格式：
{"scores":[{"dimension_key":"...","score":0,"rationale":"..."}],"overall_score":0,"passed":false,"summary":"...","issues":[{"step_idx":0,"severity":"high","dimension_key":"...","message":"...","suggestion":"..."}]}

评分维度与分级标准：
{{RUBRIC}}

待评轨迹（Markdown 时间线）：
{{TRACE}}`;
