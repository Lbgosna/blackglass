import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { domainToASCII, fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const ignoredDirectories = new Set([".git", "node_modules"]);
const d1FixtureVersion = 1;
const d1NormalizationProfile = "d1-v1";
const d1FixtureFiles = new Map([
  ["normalization.json", "normalization"],
  ["scope-comparison.json", "scope-comparison"],
  ["resolution-snapshot.json", "resolution-snapshot"],
  ["warning-flow.json", "warning-flow"],
]);
const requiredD1MalformedTargetCases = [
  {
    id: "d1.normalization.invalid-url-unclosed-ipv6-host",
    input: "https://[2001:db8::1",
    code: "invalid_url",
  },
  {
    id: "d1.normalization.invalid-url-port-out-of-range",
    input: "https://example.test:65536/",
    code: "invalid_url",
  },
  {
    id: "d1.normalization.invalid-ipv6-triple-colon",
    input: "2001:db8:::1",
    code: "invalid_ipv6",
  },
  {
    id: "d1.normalization.invalid-ipv4-cidr-prefix",
    input: "192.0.2.1/33",
    code: "invalid_cidr",
  },
  {
    id: "d1.normalization.invalid-ipv6-cidr-prefix",
    input: "2001:db8::1/129",
    code: "invalid_cidr",
  },
];
const requiredD1PositiveTargetCases = [
  {
    id: "d1.normalization.url-zone-leading-25-preserved",
    input: "https://[fe80::7%2525Eth0]/",
    canonicalTarget: {
      normalizationProfile: "d1-v1",
      kind: "url",
      url: "https://[fe80::7%2525Eth0]/",
      origin: "https://[fe80::7%2525Eth0]:443",
      host: { address: "fe80::7", zone: "25Eth0" },
      effectivePort: 443,
      pathAndQuery: "/",
    },
  },
];
const d2FixtureVersion = 1;
const d2Profile = "d2-v1";
const d2FixtureFiles = new Map([
  ["state-machine.json", "state-machine"],
  ["idempotency-concurrency.json", "idempotency-concurrency"],
  ["runner-identity.json", "runner-identity"],
  ["lease-events.json", "lease-events"],
  ["process-supervision.json", "process-supervision"],
]);
const requiredD2Cases = new Map([
  ["d2.idempotency.same-key-same-request-replays", ["idempotency-concurrency.json", "aa3e00d0ef187f8f63bc13e3c030022d4ffaf126e7a585251ca0bfce2ee6d89e"]],
  ["d2.idempotency.same-key-different-request-conflicts", ["idempotency-concurrency.json", "88f24efa597f92ca719fcd5b83827fc62be16642f9b40661efbf1454cb5b2dfe"]],
  ["d2.idempotency.continue-replay", ["idempotency-concurrency.json", "9cefe8030b0c657a5cd915033aa54dce2d4d5c9f99625c5c7ef0cd909b180acd"]],
  ["d2.idempotency.late-continue-replay", ["idempotency-concurrency.json", "0003a8e42988e4af52352475332ba91dbfd3e985da1aab726fb6ce5fd2f6bde5"]],
  ["d2.idempotency.add-scope-transaction-replay", ["idempotency-concurrency.json", "3fb06fb106e8ec9e601b069237edc30ce236b440738cfecc4237e09d57aae48e"]],
  ["d2.idempotency.retry-replay", ["idempotency-concurrency.json", "1f54a3376d975e0c42545b8450b30f98b9325f3a0393ee38103cb2ee843ba56c"]],
  ["d2.idempotency.cancel-replay", ["idempotency-concurrency.json", "0bd3e4927010f43024cfcac799b57ea1f2018b01328ac147ece9026ce4c65857"]],
  ["d2.idempotency.post-terminal-completion-replay", ["idempotency-concurrency.json", "216ac78a6bc974d7c765a5cb683b4c390ec88c0b3b86a86d43635570e081b721"]],
  ["d2.idempotency.expired-fence-event-replay", ["idempotency-concurrency.json", "6576822074ce3940f89e0e95e86d3feb680805d2f2bfc220c373b769ad94841a"]],
  ["d2.idempotency.superseded-fence-event-replay", ["idempotency-concurrency.json", "55f942f9a9ec66ebe914df4c44850315ba03164325cba64b831a3de2fe7481ee"]],
  ["d2.concurrency.revision-conflict", ["idempotency-concurrency.json", "f04561acd8789aaa4f4fb8b416228616f97f706cc4a8c9f2f001856598ac45ef"]],
  ["d2.concurrency.sqlite-mutation-boundary", ["idempotency-concurrency.json", "0d7bbedd343fcf2cb1dc4d00ee1461b6168e40b3a35db086116ca5e319623dcf"]],
  ["d2.concurrency.sqlite-busy-retry", ["idempotency-concurrency.json", "a7194c46c4995e677683c90dc32577afe19d54a875f7cb55c3d2631563b70b97"]],
  ["d2.idempotency.runner-key-generation-and-outbox", ["idempotency-concurrency.json", "3f9f37ad08263ebcab5ee444edb2244e08fca5aad339caa4ce37b0df1041e692"]],
  ["d2.lease.acquire-once", ["lease-events.json", "94cb26b64502e8a2f2fdd720929c9655e4855a3610fe43c66bbc4b408d410f8f"]],
  ["d2.lease.heartbeat-extends-from-server-time", ["lease-events.json", "6dc4ef2e153a75359c52d0871f1ec0a802f4332e9daf17586a7c8b351492459d"]],
  ["d2.lease.heartbeat-replay", ["lease-events.json", "9b47bd1d3c48d433da172d301b4f7a5a7408c31a2888944d31ba4cc0cf0cb6b6"]],
  ["d2.lease.unstarted-expiry-requeues", ["lease-events.json", "48e1e4454f1315d007c2a79490df3574d6aeb6d30f0ae9f3f48ea95841ec5b94"]],
  ["d2.lease.reassignment-increments-fence", ["lease-events.json", "72cbac4f4387c127a8d486543b14f4e4b829a98cc0f98dbc2b9041132d3afaba"]],
  ["d2.lease.fencing-exhausted-fails-before-lease", ["lease-events.json", "37589084cc6ee1eaa53b5203a305bd3735b04ebeeda99194323a6da0c2230825"]],
  ["d2.lease.running-expiry-fails", ["lease-events.json", "367fee60373f0289e733e00eeb13b7e9f09d120a6d46e1d91b67205a59e5eb9d"]],
  ["d2.lease.control-plane-restart-preserves-lease", ["lease-events.json", "bc7eafb6f8e28550765d30331a0d0e91023c1c7a66bfbeb046b3b14f790d4930"]],
  ["d2.lease.runner-restart-fences-abandoned-work", ["lease-events.json", "4f86c5b224b7a4dce069f60fe97141a98265d4ac60ae3c97bdf6c2e83798274a"]],
  ["d2.lease.stale-fence-rejected", ["lease-events.json", "fb80ff67f8fe4ea5fa0ff798f04bde10847f95e494669c0f9d229de60286f6a2"]],
  ["d2.lease.expired-append-rejected", ["lease-events.json", "4c81fab3992e2feacddb56b1c4dd9c0d84503e8695fccd01256a39d6dea6d087"]],
  ["d2.lease.owner-mismatch-rejected", ["lease-events.json", "e6a2b0b25eadaa35d31295576256880c4f1d19585c8a027d131fc6c2db1272fa"]],
  ["d2.lease.partitioned-runner-self-fences", ["lease-events.json", "5b43ea99547d00eb3f7af7380dd2ac887335e9a070d6ad52bcfe9187671fbf2f"]],
  ["d2.lease.cancel-requested-expiry-fails", ["lease-events.json", "494ccee293e412a181489429baca6e3045db65a6b611f38d6354e438427c9208"]],
  ["d2.lease.paused-running-expiry-fails", ["lease-events.json", "3257135d0b7abffd1a726fd8792b4c9976dca722eac8dcc79cedf2c9bd841e75"]],
  ["d2.event.stale-late-destination-cannot-pause", ["lease-events.json", "234178468d48f0da2ee8de251be0cd217d4799a18e2efbe9770186ebd291d627"]],
  ["d2.event.identical-sequence-replay", ["lease-events.json", "bba6a0842f17789479910c668feb4a723da9ec17c008abc8cc233740958419cd"]],
  ["d2.event.sequence-body-conflict", ["lease-events.json", "8ef9ddd6c3dc40ee09c34484a594328365378874eccef81d929a367abe896245"]],
  ["d2.event.sequence-gap-rejected", ["lease-events.json", "2bf8ed7e9b91deb9ad4df8bdf52079810519e3ece6f4d42d900a81aba701874d"]],
  ["d2.event.completion-shares-event-sequence", ["lease-events.json", "627d264224fe3d17779e6216eb012977d75cae064673502dd1e47df0a7b51632"]],
  ["d2.event.duplicate-completion-no-duplicates", ["lease-events.json", "447370182c80d27b0712da460ae63f96f17867ba2cfcbcd70e20e5842eebe6df"]],
  ["d2.sse.ordered-resume", ["lease-events.json", "30548f209cbd1e5263fc8dcbcae708a64b341e11e56226bda6fedcad85b6ca51"]],
  ["d2.sse.expired-cursor", ["lease-events.json", "0a77d466bf75ed70aff93d9f216422a48d1ad775746b3d8a59a0c4099378e715"]],
  ["d2.sse.future-cursor", ["lease-events.json", "78ffc9275e792c67dd9f0528d6cd0d4d06576104752f0207ad38be6008a32611"]],
  ["d2.process.executable-version-pinned", ["process-supervision.json", "0f806c3cbcaff81c7f9281ca793ddd53ae4eb52b7c3606bc94127ac47c3fdd4d"]],
  ["d2.process.missing-executable", ["process-supervision.json", "aaa6140885b48a51346483a0d60bb8130d8ea81d56f14c8aca68de886f1add70"]],
  ["d2.process.relative-executable-rejected", ["process-supervision.json", "4791447e5a2529a138585a32864caf9397c784869fa1b9a25f827f26b5d3fa31"]],
  ["d2.process.symlink-executable-rejected", ["process-supervision.json", "bf315e75d10d221c8f7f56c5df0ff3a207f5dbb4588d75fa9d097b90d9621c7b"]],
  ["d2.process.executable-changed-before-launch", ["process-supervision.json", "388dbe057c132ff0319996ab709642f41f71213ae34df614899e7b080148b647"]],
  ["d2.process.unsafe-executable-parent-rejected", ["process-supervision.json", "6a0a4d6865fe6258c9866d92cabfa7a2950a89dd9bf12a95176f0a5e933b8efb"]],
  ["d2.process.same-inode-rewrite-denied", ["process-supervision.json", "3c86ed48f4458707848ae5085334f73ca3ac3324c0c240dd306e3f0be43b9d63"]],
  ["d2.process.post-check-path-replacement-ignored", ["process-supervision.json", "9ec05375111141ccd7f4bf63244acde111864be37a7d951b072684daf9cd1b04"]],
  ["d2.process.argv-metacharacters-are-literal", ["process-supervision.json", "3fd5a546b40e742e494bcc7f3c7dbde208f0ca066b4c51ac6a093dea0dbee0e0"]],
  ["d2.process.command-string-contract-rejected", ["process-supervision.json", "d235b0c3a878cd9604100a06d1e1e62bfe725aafb4f55f9c31e6534045653f0b"]],
  ["d2.process.environment-denied", ["process-supervision.json", "3eaea03a3a7e70b1a001ead17fa45a0678b132c81cf0bfd63bea51a268469b9b"]],
  ["d2.process.minimal-environment", ["process-supervision.json", "7d77b3b1301ec1036c25fb853dd42b838738ba0651c5066cb9f6e635e93925d9"]],
  ["d2.process.cwd-escape-rejected", ["process-supervision.json", "f11878054b7eeee2ef9edc4ceaec2e48ebb8146dc904ed8a839a48492fb5eab4"]],
  ["d2.process.cancel-before-escalation", ["process-supervision.json", "9a75ee73e4602daa36eb21964861ab1b873c2f33199459347a234a5c9acfd121"]],
  ["d2.process.cancel-escalates-and-cleans-descendants", ["process-supervision.json", "53ed13257f17e0c7c18285654ad5c0ceda940c7fb035cfb9d4b4440ea6151209"]],
  ["d2.process.descendant-cleanup-failure", ["process-supervision.json", "426805b322305467cd538a5bb4d90fa2942d5a8eefd16b4122d00eadb562ca06"]],
  ["d2.process.duration-timeout", ["process-supervision.json", "96185702b635017353d46391a1db1f0924a3886af81a5c1568c3d209c122cda3"]],
  ["d2.process.resource-defaults-and-ranges", ["process-supervision.json", "8d231df1a7cd684f8a0a1bca164a45f844adea1e7be97c84cafc7b1768a96c62"]],
  ["d2.process.resource-limit-out-of-range", ["process-supervision.json", "3a1872f185ab38802405390580ad40d5fc4c81efd2f9501ba02c8c45febdbc00"]],
  ["d2.process.resource-unlimited-supported", ["process-supervision.json", "1a0c44b991c19fe84fb14a4f4a706499f96d9075e48286d84a34236dec8348aa"]],
  ["d2.process.output-unlimited-rejected", ["process-supervision.json", "8ba8321dfff69e0f63d865f9d6383f4d6f3576eb1a855d4fc8e90933d3454cb4"]],
  ["d2.process.unsupported-finite-resource-control", ["process-supervision.json", "4705fcc5b8e45f73297ca177d4cdb6283097acfb8b0ef2b3efb06a342574cfc6"]],
  ["d2.process.unsupported-file-limit", ["process-supervision.json", "447dac7056fd2166a116e44e79707accbb6cb26725a7e39f2269fd29495469f8"]],
  ["d2.process.output-backpressure", ["process-supervision.json", "03eab07c1287a9ecafdd515b975d735b3a848637b661b9b6536e45fc127c4f71"]],
  ["d2.process.output-truncation", ["process-supervision.json", "bdc75b9f78ab8d25e45994a0da1b1552ba957718038e9bb9b6832cac3c359a57"]],
  ["d2.process.output-redaction-before-buffer", ["process-supervision.json", "49f567cb179c386bd8f74a55a5bd583945179a9fc655db273804f1829a8a1b3a"]],
  ["d2.process.redaction-every-chunk-boundary", ["process-supervision.json", "6ec12678e67c6445df000ea214787b71dc3d7bf75c81401015ce241131b21c34"]],
  ["d2.process.redaction-invalid-utf8-preserved", ["process-supervision.json", "2b0dbaf62233223b460e560213d8fdd430a86b7a54439b50318834799750331a"]],
  ["d2.process.redaction-before-truncation-boundary", ["process-supervision.json", "638b9c8dd737da920d5f20e38cea8a3e90b143b4239a7ea0b3a718bad968ea1e"]],
  ["d2.process.redaction-final-partial-frame", ["process-supervision.json", "033ab7e685de6bdc4c28a4b1ca890b1fe47c6627f5f4c3773d91ea2ecbe187b9"]],
  ["d2.process.redaction-prefix-delimiter-and-eof", ["process-supervision.json", "2eb5233e33a63aabecda5c61e8188abcb7e29a6adb631033d525da8c337cf003"]],
  ["d2.process.redaction-field-oversize", ["process-supervision.json", "c30925f4122e6ebe67e848b29ee6a43e3b56054d5c10970323a1dbc529ee3b25"]],
  ["d2.process.long-line-continuation-frames", ["process-supervision.json", "76c593f131f4ca1283213daaba17630986af611fba701cd1428174da76526a87"]],
  ["d2.process.structured-frame-too-large", ["process-supervision.json", "00e9f707f58b716923fb457616cdbdad7016496fe2099cecf2858dcba4ddaf7d"]],
  ["d2.process.restart-stale-journal-boot-mismatch", ["process-supervision.json", "5419af1b44b646d54375ce6a63c10e2dfe8f932e066cc68181b71dc5e8e80ebe"]],
  ["d2.process.restart-pid-reuse-mismatch", ["process-supervision.json", "8b25d88947750f6ee31dc88b20ce8725c3d67d721768c726b4d52e95a5435c70"]],
  ["d2.process.nmap-unprivileged-typed-argv", ["process-supervision.json", "4a70dec4de40344b152c5a52e6e60e1ee37968a1c70337b6a4bb94a4e869a215"]],
  ["d2.process.nmap-raw-flags-rejected", ["process-supervision.json", "8d5502ce3c9e5a26cbadc208204e773dedd6601cfa37df5cef981f280819da7b"]],
  ["d2.process.nmap-privileged-mode-rejected", ["process-supervision.json", "0d5b9efae5cc7ceb80de0331a87adb9cca58bd246abe6953f71fbdd3737384a5"]],
  ["d2.runner.enrollment-owner-confirmation", ["runner-identity.json", "6ca787dc1daa104bd2a7525e6a01eb4437f9220c31daa51050f037fedd53f634"]],
  ["d2.runner.enrollment-expired", ["runner-identity.json", "3d3df47e67e19339cf118dfc49496a4e5512656d5a674ee58ca6162a8299cfee"]],
  ["d2.runner.credential-hashed-at-rest", ["runner-identity.json", "63d5957e80ed5d0257d04f86ca56ae9aca21009cceb81e7f4411c42c1c2c2584"]],
  ["d2.runner.rotation-handover", ["runner-identity.json", "b95cbf5b46fc91f57630d417fae08371f4c9353ccfce78c6416182a5051ab2d0"]],
  ["d2.runner.revocation-fences-work", ["runner-identity.json", "dd8e7cf4600da22b5b39b358443dc8847048d59b42be9dd83814833cafd6762b"]],
  ["d2.runner.lost-credential-reenrollment", ["runner-identity.json", "24395eae321dc6a4d2359e144cf841dbd3356b44e98dafb8789d26ea27e076d2"]],
  ["d2.runner.route-separation", ["runner-identity.json", "742b7757fbe900270c9a0499dd63bb268624d0047016d7d1fa9e33bb7178c5e6"]],
  ["d2.runner.protocol-handshake-accepted", ["runner-identity.json", "e2bf7f05720e3ccf9f201bfa578e1d50ec6720e0b9fbe3b4cf4e7e5a1aa6b3b8"]],
  ["d2.runner.protocol-mismatch", ["runner-identity.json", "014fbf8933b69412998067a04a0fa90072f448bbc480a27dc1c6827f99896aa4"]],
  ["d2.runner.required-capability-missing", ["runner-identity.json", "2cab2145668a5c1dcc86a5122366fa1ffc3530a604b906ec967b2d29668e95e8"]],
  ["d2.runner.event-schema-unsupported", ["runner-identity.json", "3cd1f8f3cfb8773bf951df0d02b96e1885cd11aad2ae3295cae0ffae2ceb0eab"]],
  ["d2.runner.handshake-reports-abandoned-journals", ["runner-identity.json", "7a4c906fe88622f0157b8d90f6fc2d584b55b1c15cee4092b906e099d6dbd267"]],
  ["d2.state.action-transition-matrix", ["state-machine.json", "98aefbb9f59afe966d2724f98f3264d1d059a3ede306c11c9759f68d2d99a770"]],
  ["d2.state.run-transition-matrix", ["state-machine.json", "439e1f94dd4f79f0686a3ef251cf69d20667195cf259a0266b335b8e6ee1744f"]],
  ["d2.state.d1-warning-and-capability-routing", ["state-machine.json", "a4265715fa949d3d7a3cb81ffdc051c0adf18b20fb3671c9a64d79700d749d21"]],
  ["d2.state.late-warning-pauses-before-connect", ["state-machine.json", "4b26acac6a1fe200f467dacd8b2a7bc18a9fe64646dbdf2361312165f23bfd93"]],
  ["d2.state.late-continue-binds-context-and-resumes", ["state-machine.json", "7abbeb2b685ea49bb762e50860fc3da00c5825bf12dc6e7033c78ff543ecb17d"]],
  ["d2.state.late-auto-continue-never-pauses", ["state-machine.json", "26cac6f8bce082b35bece05410f580d2ef200ab6e84b78fa3efba7e96a089de3"]],
  ["d2.state.late-covered-destination-appends-without-pause", ["state-machine.json", "1dc05d580060d9dcfa5013462238d3d562b238ca076745f01553cfe60ae90ec6"]],
  ["d2.state.late-cancel-awaits-cleanup", ["state-machine.json", "1b2278627de2b6092b275d81557302d36b306b71760e90ec9c3b6d92e6c9c5e0"]],
  ["d2.state.late-cancel-cleanup-completes", ["state-machine.json", "d1c4a7e7e6831782ab5d790c8920136d6588379f5f1bcb0ea0dfca58e78b255d"]],
  ["d2.state.late-cancel-cleanup-failure", ["state-machine.json", "fa0fab0e3d8a1a675647b22ac4d1d66af139d3bbe87407695f2fb448411129fc"]],
  ["d2.state.add-scope-appends-planning-version", ["state-machine.json", "8f8abb8a22eb7322a7ebc8e35a89da7ba66f0f6152078c6b9908da5a487203cd"]],
  ["d2.state.queued-snapshot-is-final", ["state-machine.json", "6ae0a914dcc3c619ad8a1e718968d252401b0663989d627126a7ddd491d3e126"]],
  ["d2.state.retry-preserves-action-identity", ["state-machine.json", "5f7914a5007ea5884171e72f4b14975ddb3b4624bc065d24743b390119c0f43d"]],
  ["d2.state.successful-run-retry-rejected", ["state-machine.json", "c18e4b96674ad88e5e2c82a72cc7bb83f3e137fbd727d64fc4d330a3eb7d480d"]],
  ["d2.state.one-terminal-winner", ["state-machine.json", "660514b69c01deebbdded428bf269c4cad6c87ececc1c45c680c3ec841089a4c"]],
  ["d2.state.identical-terminal-replay", ["state-machine.json", "3de944c48be1c1a7c4dd63a67007727fed32a16cdfbbe17f5197de9dd8c02a6a"]],
]);
const forbiddenFixtureValue =
  /(?:-----BEGIN [A-Z ]+PRIVATE KEY-----|\bbearer\s+\S+|\bsk-[a-z0-9_-]{12,}|\bghp_[a-z0-9]{20,}|\bgithub_pat_[a-z0-9_]{20,}|\bxoxb-[a-z0-9-]{20,})/i;
const ipv4Like = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g;
const ipv6Like = /(?<![a-z0-9])(?:[0-9a-f]{0,4}:){2,}[0-9a-f:.]*(?:%25?[a-z0-9._~-]+)?(?:\/\d{1,3})?/gi;
const domainLike = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}\.?/giu;
const singleLabelHostname = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export const forbiddenMetaPatterns = [
  /what was learned/i,
  /reference studied/i,
  /proposed amendments/i,
  /legacy working tree/i,
];

export function localMarkdownTargets(markdown) {
  const targets = [];
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;

  for (const match of markdown.matchAll(linkPattern)) {
    const rawTarget = match[1].trim();
    if (
      rawTarget.length === 0 ||
      rawTarget.startsWith("#") ||
      /^(?:https?:|mailto:)/i.test(rawTarget)
    ) {
      continue;
    }

    const target = rawTarget.split("#", 1)[0];
    if (target.length > 0) targets.push(target);
  }

  return targets;
}

async function markdownFiles(directory) {
  const files = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await markdownFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }

  return files;
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalJsonValue(value) {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalJsonValue(value[key])]),
  );
}

function d2CaseFingerprint(fixtureCase) {
  const outcomeName = Object.hasOwn(fixtureCase, "expected") ? "expected" : "error";
  const criticalContract = {
    given: fixtureCase.given,
    [outcomeName]: fixtureCase[outcomeName],
  };
  return createHash("sha256")
    .update(JSON.stringify(canonicalJsonValue(criticalContract)))
    .digest("hex");
}

function normalizedFieldName(key) {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isForbiddenFixtureKey(key) {
  const normalizedKey = normalizedFieldName(key);
  return (
    /(?:secret|token|password|apikey|privatekey|cookie)$/.test(normalizedKey) ||
    normalizedKey === "authorization"
  );
}

function isSingleLabelTargetField(key) {
  return /(?:input|target|hostname|host|queryname|sniname|hostheader)$/.test(
    normalizedFieldName(key),
  );
}

function isTargetBearingField(key) {
  return (
    isSingleLabelTargetField(key) ||
    /(?:url|origin|location|destination)$/.test(normalizedFieldName(key))
  );
}

function documentationIpv4(address) {
  return /^(?:192\.0\.2|198\.51\.100|203\.0\.113)\./.test(address);
}

function ipv6Words(address) {
  let expandedAddress = address.toLowerCase();
  if (expandedAddress.includes(".")) {
    const lastColon = expandedAddress.lastIndexOf(":");
    const octets = expandedAddress
      .slice(lastColon + 1)
      .split(".")
      .map((octet) => Number.parseInt(octet, 10));
    expandedAddress = `${expandedAddress.slice(0, lastColon)}:${(
      (octets[0] << 8) |
      octets[1]
    ).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }

  const halves = expandedAddress.split("::");
  const left = halves[0] ? halves[0].split(":").map((word) => Number.parseInt(word, 16)) : [];
  const right = halves[1] ? halves[1].split(":").map((word) => Number.parseInt(word, 16)) : [];
  const zeroCount = halves.length === 2 ? 8 - left.length - right.length : 0;
  return [...left, ...Array.from({ length: zeroCount }, () => 0), ...right];
}

function isReservedFixtureIpv6(address) {
  const words = ipv6Words(address);
  const isMappedIpv4 = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  if (isMappedIpv4) {
    const mappedAddress = [words[6] >> 8, words[6] & 0xff, words[7] >> 8, words[7] & 0xff].join(
      ".",
    );
    return documentationIpv4(mappedAddress);
  }

  const isDocumentationAddress = words[0] === 0x2001 && words[1] === 0x0db8;
  const isLinkLocalAddress = (words[0] & 0xffc0) === 0xfe80;
  return isDocumentationAddress || isLinkLocalAddress;
}

function unicodeTargetHostname(value, key) {
  if (!isTargetBearingField(key)) return undefined;

  if (/^https?:\/\//i.test(value)) {
    try {
      const hostname = new URL(value).hostname;
      if (!hostname.startsWith("[") && isIP(hostname) === 0) return hostname.toLowerCase();
    } catch {
      return undefined;
    }
  }

  if (value.includes(".") && /[^\x00-\x7f]/u.test(value)) {
    const hostname = domainToASCII(value.replace(/\.$/, ""));
    if (hostname) return hostname.toLowerCase();
  }

  return undefined;
}

function fixtureContentErrors(value, location, key = "") {
  const errors = [];

  if (isForbiddenFixtureKey(key)) {
    errors.push(`${location}: forbidden secret-bearing field ${key}`);
  }

  if (typeof value === "string") {
    if (forbiddenFixtureValue.test(value)) {
      errors.push(`${location}: contains secret-like content`);
    }

    for (const match of value.matchAll(ipv4Like)) {
      const address = match[0];
      if (!documentationIpv4(address)) {
        errors.push(`${location}: contains non-documentation IPv4 address ${address}`);
      }
    }

    for (const match of value.matchAll(ipv6Like)) {
      const address = match[0].replace(/\/\d{1,3}$/, "").replace(/%25?[a-z0-9._~-]+$/i, "");
      if (isIP(address) === 6 && !isReservedFixtureIpv6(address)) {
        errors.push(`${location}: contains non-documentation IPv6 address ${address}`);
      }
    }

    if (
      isSingleLabelTargetField(key) &&
      singleLabelHostname.test(value) &&
      !/-lab$/i.test(value)
    ) {
      errors.push(`${location}: contains non-synthetic single-label hostname ${value}`);
    }

    const unicodeHostname = unicodeTargetHostname(value, key);
    if (unicodeHostname && !/\.(?:test|example|invalid)$/.test(unicodeHostname)) {
      errors.push(`${location}: contains non-reserved hostname ${unicodeHostname}`);
    }

    if (key !== "id" && key !== "description" && value !== "C.UTF-8") {
      for (const match of value.matchAll(domainLike)) {
        const hostname = match[0].replace(/\.$/, "").toLowerCase();
        if (!/\.(?:test|example|invalid)$/.test(hostname)) {
          errors.push(`${location}: contains non-reserved hostname ${match[0]}`);
        }
      }
    }

    return errors;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      errors.push(...fixtureContentErrors(item, `${location}[${index}]`, key));
    }
    return errors;
  }

  if (isRecord(value)) {
    for (const [childKey, childValue] of Object.entries(value)) {
      errors.push(...fixtureContentErrors(childValue, `${location}.${childKey}`, childKey));
    }
  }

  return errors;
}

function requiredMalformedTargetErrors(fixtureCases, relativePath) {
  const errors = [];
  const casesById = new Map(
    fixtureCases
      .filter((fixtureCase) => isRecord(fixtureCase) && typeof fixtureCase.id === "string")
      .map((fixtureCase) => [fixtureCase.id, fixtureCase]),
  );

  for (const requiredCase of requiredD1MalformedTargetCases) {
    const fixtureCase = casesById.get(requiredCase.id);
    if (!fixtureCase) {
      errors.push(`${relativePath}: missing required malformed target case ${requiredCase.id}`);
      continue;
    }
    if (fixtureCase.given?.input !== requiredCase.input) {
      errors.push(
        `${relativePath}: ${requiredCase.id}.given.input must be ${JSON.stringify(requiredCase.input)}`,
      );
    }
    if (fixtureCase.error?.code !== requiredCase.code) {
      errors.push(`${relativePath}: ${requiredCase.id}.error.code must be ${requiredCase.code}`);
    }
  }

  return errors;
}

function requiredPositiveTargetErrors(fixtureCases, relativePath) {
  const errors = [];
  const casesById = new Map(
    fixtureCases
      .filter((fixtureCase) => isRecord(fixtureCase) && typeof fixtureCase.id === "string")
      .map((fixtureCase) => [fixtureCase.id, fixtureCase]),
  );

  for (const requiredCase of requiredD1PositiveTargetCases) {
    const fixtureCase = casesById.get(requiredCase.id);
    if (!fixtureCase) {
      errors.push(`${relativePath}: missing required positive target case ${requiredCase.id}`);
      continue;
    }
    if (fixtureCase.given?.input !== requiredCase.input) {
      errors.push(
        `${relativePath}: ${requiredCase.id}.given.input must be ${JSON.stringify(requiredCase.input)}`,
      );
    }
    if (!isDeepStrictEqual(fixtureCase.expected?.canonicalTarget, requiredCase.canonicalTarget)) {
      errors.push(
        `${relativePath}: ${requiredCase.id}.expected.canonicalTarget must preserve zone 25Eth0`,
      );
    }
  }

  return errors;
}

export async function checkD1Fixtures(repositoryRoot) {
  const fixtureDirectory = path.join(repositoryRoot, "docs", "architecture", "fixtures", "d1");
  const errors = [];
  const caseIds = new Map();

  if (!(await exists(fixtureDirectory))) {
    return ["docs/architecture/fixtures/d1: missing D1 fixture directory"];
  }

  const fixtureEntries = await readdir(fixtureDirectory, { withFileTypes: true });
  for (const entry of fixtureEntries) {
    if (entry.isFile() && entry.name.endsWith(".json") && !d1FixtureFiles.has(entry.name)) {
      errors.push(`docs/architecture/fixtures/d1/${entry.name}: unexpected D1 fixture file`);
    }
  }

  for (const [fileName, expectedKind] of d1FixtureFiles) {
    const fixturePath = path.join(fixtureDirectory, fileName);
    const relativePath = path.relative(repositoryRoot, fixturePath);

    if (!(await exists(fixturePath))) {
      errors.push(`${relativePath}: missing required D1 fixture file`);
      continue;
    }

    let fixture;
    try {
      fixture = JSON.parse(await readFile(fixturePath, "utf8"));
    } catch (error) {
      errors.push(`${relativePath}: invalid JSON: ${error.message}`);
      continue;
    }

    if (!isRecord(fixture)) {
      errors.push(`${relativePath}: fixture root must be an object`);
      continue;
    }

    if (fixture.fixtureVersion !== d1FixtureVersion) {
      errors.push(`${relativePath}: fixtureVersion must be ${d1FixtureVersion}`);
    }
    if (fixture.normalizationProfile !== d1NormalizationProfile) {
      errors.push(`${relativePath}: normalizationProfile must be ${d1NormalizationProfile}`);
    }
    if (fixture.kind !== expectedKind) {
      errors.push(`${relativePath}: kind must be ${expectedKind}`);
    }
    if (!Array.isArray(fixture.cases) || fixture.cases.length === 0) {
      errors.push(`${relativePath}: cases must be a non-empty array`);
      continue;
    }

    for (const [index, fixtureCase] of fixture.cases.entries()) {
      const caseLocation = `${relativePath}: cases[${index}]`;
      if (!isRecord(fixtureCase)) {
        errors.push(`${caseLocation} must be an object`);
        continue;
      }

      if (typeof fixtureCase.id !== "string" || !/^d1\.[a-z0-9.-]+$/.test(fixtureCase.id)) {
        errors.push(`${caseLocation}.id must be a stable d1 case ID`);
      } else if (caseIds.has(fixtureCase.id)) {
        errors.push(
          `${caseLocation}.id duplicates ${fixtureCase.id} from ${caseIds.get(fixtureCase.id)}`,
        );
      } else {
        caseIds.set(fixtureCase.id, caseLocation);
      }

      if (typeof fixtureCase.description !== "string" || fixtureCase.description.trim() === "") {
        errors.push(`${caseLocation}.description must be a non-empty string`);
      }
      if (!isRecord(fixtureCase.given)) {
        errors.push(`${caseLocation}.given must be an object`);
      }

      const hasExpected = Object.hasOwn(fixtureCase, "expected");
      const hasError = Object.hasOwn(fixtureCase, "error");
      if (hasExpected === hasError) {
        errors.push(`${caseLocation} must contain exactly one of expected or error`);
      } else {
        const outcomeName = hasExpected ? "expected" : "error";
        const outcome = fixtureCase[outcomeName];
        if (!isRecord(outcome) || Object.keys(outcome).length === 0) {
          errors.push(`${caseLocation}.${outcomeName} must be a non-empty object`);
        }
        if (hasError && (typeof outcome?.code !== "string" || outcome.code.trim() === "")) {
          errors.push(`${caseLocation}.error.code must be a non-empty string`);
        }
      }

      errors.push(...fixtureContentErrors(fixtureCase, caseLocation));
    }

    if (expectedKind === "normalization") {
      errors.push(...requiredMalformedTargetErrors(fixture.cases, relativePath));
      errors.push(...requiredPositiveTargetErrors(fixture.cases, relativePath));
    }
  }

  return errors;
}

export async function checkD2Fixtures(repositoryRoot) {
  const fixtureDirectory = path.join(repositoryRoot, "docs", "architecture", "fixtures", "d2");
  const errors = [];
  const caseIds = new Map();

  if (!(await exists(fixtureDirectory))) {
    return ["docs/architecture/fixtures/d2: missing D2 fixture directory"];
  }

  const fixtureEntries = await readdir(fixtureDirectory, { withFileTypes: true });
  for (const entry of fixtureEntries) {
    if (entry.isFile() && entry.name.endsWith(".json") && !d2FixtureFiles.has(entry.name)) {
      errors.push(`docs/architecture/fixtures/d2/${entry.name}: unexpected D2 fixture file`);
    }
  }

  for (const [fileName, expectedKind] of d2FixtureFiles) {
    const fixturePath = path.join(fixtureDirectory, fileName);
    const relativePath = path.relative(repositoryRoot, fixturePath);

    if (!(await exists(fixturePath))) {
      errors.push(`${relativePath}: missing required D2 fixture file`);
      continue;
    }

    let fixture;
    try {
      fixture = JSON.parse(await readFile(fixturePath, "utf8"));
    } catch (error) {
      errors.push(`${relativePath}: invalid JSON: ${error.message}`);
      continue;
    }

    if (!isRecord(fixture)) {
      errors.push(`${relativePath}: fixture root must be an object`);
      continue;
    }
    if (fixture.fixtureVersion !== d2FixtureVersion) {
      errors.push(`${relativePath}: fixtureVersion must be ${d2FixtureVersion}`);
    }
    if (fixture.profile !== d2Profile) {
      errors.push(`${relativePath}: profile must be ${d2Profile}`);
    }
    if (fixture.kind !== expectedKind) {
      errors.push(`${relativePath}: kind must be ${expectedKind}`);
    }
    if (!Array.isArray(fixture.cases) || fixture.cases.length === 0) {
      errors.push(`${relativePath}: cases must be a non-empty array`);
      continue;
    }

    for (const [index, fixtureCase] of fixture.cases.entries()) {
      const caseLocation = `${relativePath}: cases[${index}]`;
      if (!isRecord(fixtureCase)) {
        errors.push(`${caseLocation} must be an object`);
        continue;
      }

      if (typeof fixtureCase.id !== "string" || !/^d2\.[a-z0-9.-]+$/.test(fixtureCase.id)) {
        errors.push(`${caseLocation}.id must be a stable d2 case ID`);
      } else if (caseIds.has(fixtureCase.id)) {
        errors.push(
          `${caseLocation}.id duplicates ${fixtureCase.id} from ${caseIds.get(fixtureCase.id)}`,
        );
      } else {
        caseIds.set(fixtureCase.id, caseLocation);
      }

      if (typeof fixtureCase.description !== "string" || fixtureCase.description.trim() === "") {
        errors.push(`${caseLocation}.description must be a non-empty string`);
      }
      if (!isRecord(fixtureCase.given) || Object.keys(fixtureCase.given).length === 0) {
        errors.push(`${caseLocation}.given must be a non-empty object`);
      }

      const hasExpected = Object.hasOwn(fixtureCase, "expected");
      const hasError = Object.hasOwn(fixtureCase, "error");
      if (hasExpected === hasError) {
        errors.push(`${caseLocation} must contain exactly one of expected or error`);
      } else {
        const outcomeName = hasExpected ? "expected" : "error";
        const outcome = fixtureCase[outcomeName];
        if (!isRecord(outcome) || Object.keys(outcome).length === 0) {
          errors.push(`${caseLocation}.${outcomeName} must be a non-empty object`);
        }
        if (hasError && (typeof outcome?.code !== "string" || outcome.code.trim() === "")) {
          errors.push(`${caseLocation}.error.code must be a non-empty string`);
        }
      }

      errors.push(...fixtureContentErrors(fixtureCase, caseLocation));

      if (typeof fixtureCase.id === "string") {
        const required = requiredD2Cases.get(fixtureCase.id);
        if (!required) {
          errors.push(`${caseLocation}.id is not a required d2-v1 case`);
        } else {
          const [requiredFileName, requiredFingerprint] = required;
          if (fileName !== requiredFileName) {
            errors.push(`${caseLocation}.id must be in ${requiredFileName}`);
          }
          if (hasExpected !== hasError) {
            const fingerprint = d2CaseFingerprint(fixtureCase);
            if (fingerprint !== requiredFingerprint) {
              errors.push(
                `${caseLocation}: ${fixtureCase.id} critical given fields or exact outcome changed`,
              );
            }
          }
        }
      }
    }
  }

  for (const [requiredId, [requiredFileName]] of requiredD2Cases) {
    if (!caseIds.has(requiredId)) {
      errors.push(
        `docs/architecture/fixtures/d2/${requiredFileName}: missing required D2 case ${requiredId}`,
      );
    }
  }

  return errors;
}

export async function checkDocumentation(repositoryRoot) {
  const errors = [];

  for (const file of await markdownFiles(repositoryRoot)) {
    const relativeFile = path.relative(repositoryRoot, file);
    const markdown = await readFile(file, "utf8");

    for (const pattern of forbiddenMetaPatterns) {
      if (pattern.test(markdown)) {
        errors.push(`${relativeFile}: contains review/source metadata matching ${pattern}`);
      }
    }

    for (const target of localMarkdownTargets(markdown)) {
      const resolvedTarget = path.resolve(path.dirname(file), target);
      if (!(await exists(resolvedTarget))) {
        errors.push(`${relativeFile}: missing local link target ${target}`);
      }
    }
  }

  const d1FixtureDirectory = path.join(repositoryRoot, "docs", "architecture", "fixtures", "d1");
  const d1AdrPath = path.join(
    repositoryRoot,
    "docs",
    "architecture",
    "0001-target-normalization-scope-warnings.md",
  );
  if ((await exists(d1AdrPath)) || (await exists(d1FixtureDirectory))) {
    errors.push(...(await checkD1Fixtures(repositoryRoot)));
  }

  const d2FixtureDirectory = path.join(repositoryRoot, "docs", "architecture", "fixtures", "d2");
  const d2AdrPath = path.join(
    repositoryRoot,
    "docs",
    "architecture",
    "0002-actions-runs-runner-trust.md",
  );
  if ((await exists(d2AdrPath)) || (await exists(d2FixtureDirectory))) {
    errors.push(...(await checkD2Fixtures(repositoryRoot)));
  }

  return errors;
}

async function main() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const errors = await checkDocumentation(repositoryRoot);

  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
    return;
  }

  console.log("Documentation check passed.");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
