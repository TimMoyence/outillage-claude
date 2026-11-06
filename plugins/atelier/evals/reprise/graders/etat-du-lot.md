---
type: llm
weight: 2
---

PASS si la réponse finale nomme la task list `.lots/pause.tasklist.json` (lot « pause »), dit que S1 est verte et que la prochaine step est S2 : la pause de midi ne compte pas.
FAIL si elle ne trouve pas cette task list, en propose une nouvelle, ou donne une autre prochaine step.
