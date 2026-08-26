import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { URL } from "node:url";

const PORT = Number(process.env.MOCK_WHM_PORT ?? 8443);
const TOKEN = process.env.MOCK_WHM_TOKEN ?? "test-token";

const key = readFileSync(new URL("./mock-whm-key.pem", import.meta.url));
const cert = readFileSync(new URL("./mock-whm-cert.pem", import.meta.url));

const accounts = [
  {
    user: "acme",
    domain: "acme.example.com",
    disklimit: "5000",
    diskused: "1234",
    suspended: 0,
    suspendreason: "",
  },
  {
    user: "widgetco",
    domain: "widgetco.example.com",
    disklimit: "unlimited",
    diskused: "567",
    suspended: 0,
    suspendreason: "",
  },
  {
    user: "oldclient",
    domain: "oldclient.example.com",
    disklimit: "2000",
    diskused: "1980",
    suspended: 1,
    suspendreason: "Non-payment",
  },
];

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

const ok = (data) => ({
  metadata: { result: 1, reason: "OK", version: 1 },
  data,
});
const fail = (reason) => ({ metadata: { result: 0, reason, version: 1 } });

const server = createServer({ key, cert }, (req, res) => {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const auth = req.headers["authorization"] ?? "";
  const match = auth.match(/^whm\s+([^:]+):(.+)$/i);

  if (!match || match[2] !== TOKEN) {
    return send(res, 200, fail("Login Failed"));
  }

  const fn = url.pathname.replace(/^\/json-api\//, "");
  const params = Object.fromEntries(url.searchParams.entries());

  switch (fn) {
    case "version":
      return send(res, 200, ok({ version: "11.128.0.10" }));

    case "gethostname":
      return send(res, 200, ok({ hostname: "mock-whm.local" }));

    case "loadavg":
      return send(res, 200, ok({ one: 0.15, five: 0.22, fifteen: 0.31 }));

    case "listaccts":
      return send(res, 200, ok({ acct: accounts }));

    case "suspendacct": {
      const account = accounts.find((a) => a.user === params.user);
      if (!account)
        return send(res, 200, fail(`No such account: ${params.user}`));
      account.suspended = 1;
      account.suspendreason = params.reason ?? "";
      return send(res, 200, {
        metadata: {
          command: "suspendacct",
          result: 1,
          reason: "OK",
          version: 1,
        },
      });
    }

    case "unsuspendacct": {
      const account = accounts.find((a) => a.user === params.user);
      if (!account)
        return send(res, 200, fail(`No such account: ${params.user}`));
      account.suspended = 0;
      account.suspendreason = "";
      return send(res, 200, {
        metadata: {
          command: "unsuspendacct",
          result: 1,
          reason: "OK",
          version: 1,
        },
      });
    }

    default:
      return send(res, 200, fail(`Unknown function: ${fn}`));
  }
});

server.listen(PORT, () => {
  console.log(`Mock WHM server listening on https://localhost:${PORT}`);
  console.log(`Token: ${TOKEN}`);
});
