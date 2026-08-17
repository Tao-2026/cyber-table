# Cyber Table v1 架构提案（确认前草案）

状态：视觉方向采用“家庭友好 Cyberpunk”；独立 Spark Firebase 项目与 GitHub 仓库已建立。正式多人生命周期使用事务化终局结算、轮换与 Podium；任何新功能仍通过独立分支和 Draft PR 验证后发布。

视觉基准保存在 `docs/design/family-friendly-cyberpunk-reference.png`：深蓝夜空背景，柔和天蓝、薰衣草紫、薄荷绿、珊瑚粉和暖黄色；圆润厚实的卡片与大按钮；可爱机器人、熊猫、兔子等身份；轻微星星装饰。保留 Cyberpunk 的数字街机感，但避免刺眼霓虹、尖锐造型、强故障效果和压迫性的竞技表达。

## 1. 环境检查

- 工作区 `Cyber Table` 是独立 Git 仓库，目前无提交、无远程地址，未发现 CyberSnake 文件。
- GitHub CLI 已在 2026-08-17 验证成功登录账户 `Tao-2026`，Git 操作协议为 HTTPS。验证过程中未读取或保存完整 token；后续远程操作仍须得到项目所有者明确确认。
- 本项目所有路径使用相对路径，运行时不依赖 CyberSnake，也不写死 `/cyber-table/` 或 Firebase 项目 ID。

## 2. 架构边界

采用四层结构：

1. **Game Core**：Tic-Tac-Toe 纯函数规则、状态转换和积分计算，不依赖 DOM/Firebase。
2. **Application**：房间用例、状态机、轮换策略与输入验证，只依赖抽象端口。
3. **Adapters**：Firebase Anonymous Auth、Firestore 实时监听/事务、浏览器存储。
4. **UI**：可挂载视图，统一提供 `mount(container, options)` 与 `unmount()`。

依赖方向始终指向核心。Firebase 配置由入口注入；未来同页可以通过具名 Firebase App 同时初始化 CyberSnake 与 Cyber Table。

## 3. 建议文件结构

```text
index.html
styles/
  cyber-theme.css
  app.css
src/
  app.js
  config/
    firebase-config.example.js
    game-config.js
  core/
    i18n.js
    emoji.js
    storage.js
    room-machine.js
    ports.js
  games/tic-tac-toe/
    rules.js
    state.js
    view.js
  services/
    auth-service.js
    room-service.js
    firebase-service.js
  ui/
    lobby-view.js
    room-view.js
    podium-view.js
    status-view.js
tests/
  unit/
  integration/
  rules/
  e2e/
docs/
  ARCHITECTURE_PROPOSAL.md
  design/mobile-concept-board-v1.png
firestore.rules
firestore.indexes.json
firebase.json
README.md
FIREBASE_SETUP.md
```

重要调整：建议把 `room-state.js` 命名为 `room-machine.js`，明确它负责受控状态转换而不是普通数据对象；增加 `ports.js`，让核心通过接口接受后端实现；Firebase 配置只提交不含真实项目值的示例文件。

## 4. 房间状态机

```text
lobby -> ready -> playing -> roundOver -> rotating -> playing
  |        |         |           |            |
  +--------+---------+-----------+------------+-> partyOver
  +------------------------------------------------> expired
```

| 状态 | 允许操作 | 转出条件 |
|---|---|---|
| `lobby` | 加入、恢复座位、换未占用 Emoji、离开；房主结束聚会 | 达到 2 人后由系统派生为 `ready` |
| `ready` | 同 lobby；房主开始比赛 | 有效房主请求开始，事务创建首局 |
| `playing` | 当前对局且当前回合玩家落一子；所有成员读取 | 胜/平后事务进入 `roundOver` |
| `roundOver` | 只读结果；房主可结束聚会 | 短暂展示后进入 `rotating` |
| `rotating` | 系统/房主触发下一组选手，客户端只读 | 事务创建下一局后进入 `playing` |
| `partyOver` | 只读 Podium；房主可在同成员集内重新开始 | 房主重新开始进入 `ready` |
| `expired` | 只允许展示友好提示 | 终态 |

状态以服务器时间和事务结果为准。`ready` 可作为服务端持久状态，避免多客户端对“是否可开始”产生不同判断。

房主离开规则建议：短暂离线保留房主身份；超过“房主失联宽限期”后，最早加入且仍活跃的玩家可在事务中接任。若没有可接任玩家，房间等待过期，不自动删除正式数据。

## 5. Firestore 数据模型

```text
rooms/{roomId}
  hostId, roomCode, status, currentMatchId
  rotationCursor, gameVersion, schemaVersion
  createdAt, updatedAt, expiresAt
  settings: { maxPlayers, gameType }

rooms/{roomId}/players/{uid}
  playerId, emoji, seat, partyScore
  joinedAt, lastSeenAt, status

rooms/{roomId}/matches/{matchId}
  gameType, playerX, playerO, board, currentTurn
  status, winner, moveCount, winningLine
  scoreApplied, createdAt, updatedAt

roomCodes/{roomCode}
  roomId, expiresAt
```

增加 `roomCodes` 是为了用短码进行单文档查询并用创建事务保证唯一性，避免扫描房间集合。该映射只存路由信息；规则限制为已认证用户读取、仅在严格匹配房间创建流程时创建。房间、玩家、对局仍是权威数据。

不为每一步创建公开可写的 move 文档；棋盘保存在 match 中，单步由事务做前后状态校验。这降低监听成本，也让“每次只改一格”更容易在规则中验证。若未来需要审计/回放，再增加由可信后端写入的不可变事件日志。

## 6. 安全边界与并发方案

- 所有访问要求 Firebase Authentication；匿名 UID 仅在当前 Firebase 项目内有意义，不与 CyberSnake 共享。
- 房间读取要求调用者存在于 `players/{uid}`；加入流程只允许创建自己的玩家文档，并限制字段、类型、长度、座位范围和 Emoji 集。
- 玩家常规更新只允许自己的 `lastSeenAt/status`；Emoji/seat/score 不允许客户端任意更新。Emoji 与座位分配在加入事务中完成。
- 房主管理操作要求 `request.auth.uid == room.hostId`，并校验合法状态转换；客户端不允许删除正式房间、玩家或对局。
- 落子必须在 Firestore transaction 中读取 room + match：验证 `playing`、对局未结束、调用者是当前玩家、只改变一个空格、moveCount +1、回合/胜负/平局均由纯规则推导。
- 使用 `updatedAt == request.time` 等服务器时间约束；合理限制字符串、数组长度、人数和有效期。Firestore Rules 无法可靠实现通用速率限制，只能通过窄写入面、事务前置条件和 App Check（后续可选）降低滥用。
- `scoreApplied` 防止重复结算；结束对局、计分和切换房间状态应在同一事务内完成。重复点击、离线重试和近同时落子最多一个提交成功，失败客户端从实时快照恢复。
- Rules 能做权限隔离和状态差分校验，但纯前端无法提供服务器级反作弊；首版不宣称完全防作弊。
- Rules 与 Emulator 测试必须覆盖允许/拒绝矩阵，部署生产 Rules/Indexes 前先通过 Emulator。

## 7. 生命周期与恢复

- `localStorage` 使用 `cyberTable.*`；只保存 `roomId`、匿名 UID 对应的本地恢复提示和 UI 偏好，不保存密钥。
- 语言优先读取 `cyberArcade.language`，回退到 `cyberTable.language`，再回退英文。
- 刷新后匿名认证恢复，按 UID 查询自己的玩家文档并恢复座位；重复加入是幂等操作。
- 短暂断网不移除玩家。客户端显示 offline/reconnecting/synced，写入失败不崩溃并在重新监听后以服务器状态校正。
- 建议初始值：房间 6 小时过期；玩家 10 分钟无活动后可被房主跳过；房主失联 3 分钟后允许接任。这三项需要产品确认。

## 8. 轮换与积分

- 积分独立配置：胜 3、平双方各 1、负 0。
- 轮换建议采用稳定座位顺序的循环配对队列；每位玩家与其他玩家交手前不重复对手，上一局两位选手下一局优先成为观众。2 人房间例外，持续重赛。
- Podium 按 `partyScore` 降序；同分依次比较胜局数、加入时间，仍相同则并列展示（数据排序使用稳定 seat）。文案只庆祝参与和高光，不羞辱落后玩家。

## 9. Cyber Arcade 合并准备

- CSS token 全部以 `--cyber-*` 命名；模块不写入 `window`。
- UI 生命周期可嵌入任意容器；所有静态资源和 import 使用相对路径，并增加子路径部署 E2E 测试。
- emoji、i18n、theme、podium 先保留清晰模块边界，但当前仓库保存独立副本且无远程运行时依赖。
- 未来用 `git subtree` 保留历史并入 `cyber-arcade/apps/cyber-table`；可再将通用模块迁移到 `shared/`。
- 两个独立 Firebase 项目的匿名 UID 不共享。前端可统一但后端继续独立；跨游戏身份、成就若未来需要，必须另做身份迁移设计。

## 10. 待确认产品决策

以下决策已于 2026-08-17 全部确认：

1. **轮换策略**：尽量不重复对手的循环配对；两人房间持续重赛。
2. **房主接任**：失联 3 分钟后由最早加入的活跃玩家接任。
3. **时间参数**：房间 6 小时过期、玩家 10 分钟后可跳过、每局结束展示 4 秒。
4. **聚会结束方式**：仅房主手动结束，不设固定局数。
5. **同分 Podium**：视觉并列，数据用 seat 稳定排序。
6. **Emoji 更换**：仅在 `lobby/ready` 允许，开始后锁定。
7. **未活跃玩家**：保留座位和分数，轮换时可跳过，恢复后重新进入队列。

新增确认项：提供无需创建房间、无需 Firebase、无需联网的简单电脑练习模式；电脑随机选择合法空格；练习结果不计 Party Score 或 Podium。首页提供独立入口并明确标注 Practice。

## 11. 确认后的实施顺序

1. 根据反馈修订架构和视觉稿。
2. 建立纯前端本地原型及规则/状态机单测。
3. 编写并用 Firebase Emulator 验证 Firestore Rules 与多客户端流程。
4. 在进行任何远程操作前，再次列出目标；经明确确认后才重新登录 GitHub、创建公开仓库并推送开发分支。
5. Firebase 项目创建、生产 Rules/Indexes 部署、GitHub Pages 和合并 `main` 均分别等待确认。
