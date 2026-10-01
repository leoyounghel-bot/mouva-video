# Hosted Studio credits

Studio authenticates the signed-in Mouva account before supplying its identity to a fixed HTTPS billing service. Browser requests never choose the account, price, provider model or billing service URL. The shared service requires a separate server secret of at least 32 characters. Keep this secret outside Git and the frontend.

Enable `MOUVA_MEDIA_BILLING_ENABLED=true` only after the account server has the media-credit schema and the same service secret. Set `MOUVA_BILLING_URL` to its fixed private API path. The account service owns the active quote version and account balance; Studio fails before provider dispatch if a reservation cannot be verified.

The customer confirms a quote before Agent planning, scene generation, image generation or finished video submission. Each video candidate is a separate operation; image rounds reserve their quoted count and settle delivered candidates. Operation IDs are durable and account-scoped. Replaying a completed or uncertain operation does not dispatch another provider job. Selecting a saved candidate, manual native editing and local export do not use AI credits.

Receipts survive restarts. Completed work whose settlement service is temporarily unavailable retries reconciliation every 30 seconds. A submission with an unknown provider outcome retains its reservation until an operator verifies the provider task. Do not release an uncertain hold solely because a browser closed or a task timed out. The account-server operator reconciliation tool stores the evidence reference with the outcome.

Provider list-price evidence is stored separately from the fixed customer quote. Video cost uses provider-reported completion tokens when available; missing usage is not fabricated. Preliminary estimates include motion-reference input and all candidates, flag unverified minimum-token floors, and are not checkout quotes. Final provider invoices, storage, payment fees and taxes still require reconciliation.

**中文：** 线上 Studio 与 Design 共用积分账本。生成前展示服务端报价并预留额度；成功后只结算一次；确认失败释放未使用额度。每个视频候选独立计费，图片按成功交付数量结算。提交结果不确定时保留预留额度，核验提供方任务后对账。采纳候选、手动原生编辑和本地导出不消耗 AI 积分。

A partially submitted video round quotes only its remaining submissions when resumed. Existing accepted candidates retain their original task IDs and reservations. An unknown accepted response still needs recovery with its original operation ID; never automatically create replacement paid jobs.
