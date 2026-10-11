# 连接 SuXin（Books、Barcode Scan、Every Data）· Connecting to SuXin

给合作伙伴的系统（POS、WMS、TMS）用：把你的销售、库存、商品、送货资料送进 SuXin，
SuXin Books、SuXin Barcode Scan 和 SuXin Every Data 就会显示、记账、对账。

For a partner's system (a POS, a WMS, a TMS): send your sales, stock, products and
deliveries to SuXin, and SuXin Books, SuXin Barcode Scan and SuXin Every Data show
them, post them to the books and count against them.

---

## 1. 两种方式 · Two ways

| 方式 Way | 谁做什么 Who does what |
|---|---|
| **他们送来 PUSH**（推荐 recommended） | 你的系统用 HTTPS `POST` 把资料送到 SuXin。 Your system POSTs to SuXin. |
| **我们去拿 PULL** | 你的系统有 REST API，SuXin 每小时来拿一次。 Your system has a REST API; SuXin fetches from it every hour. |

两种方式都由 SuXin 那边的老板在 **连接** 页面设定（Books、Barcode Scan、Every Data、WMS、TMS 都有这页）。
Either way, the SuXin owner sets it up on the **Connections (连接)** page.

---

## 2. PUSH：你的系统送资料给 SuXin

SuXin 老板在「连接」新增一个连接，选 **他们送来给我们**，勾选要收的资料，按 **生成推送钥匙**。
他会给你：

- 一个地址（每种资料一个）
- 一把推送钥匙 `sxc_...`（只显示一次；如果不见了，请他生成新的，旧的就作废）

```
POST https://stockcheck-api-52988097941.asia-southeast1.run.app/connect/{公司编号}/{连接编号}/{种类}
Authorization: Bearer sxc_xxxxxxxxxxxxxxxx
Content-Type: application/json
```

`{种类}` / kind = `sales` · `stock` · `items` · `deliveries`

Body 可以是 `{ "data": [ ... ] }`，或直接一个 JSON 列表 `[ ... ]`。
The body is `{ "data": [ ... ] }` or a plain JSON list.

**钥匙只放在 header，不要放在网址里。** Put the key in the header, never in the URL.

### 回答 · Response

```json
{ "accepted": 2, "skipped": ["#3: no id"] }
```

- 同一笔资料（同一个 id）送两次，SuXin 只记一次——送错了可以放心重送。
  The same record (same id) sent twice is kept once: resending is safe.
- 每次最多 2000 笔，每分钟最多 120 次，每次最大 2 MB。
  At most 2000 records, 120 requests a minute, 2 MB per request.
- 错误：`401` 钥匙不对，`400` 这个连接不收这种资料，`404` 连接关了或地址不对，`429` 太快。

---

## 3. 资料格式 · The formats

下面是 SuXin **默认的字段名字**。你的系统用别的名字也可以：SuXin 老板在连接的
「他们的字段名字」填你的名字就行（例如 `receipt_no` 改成 `doc_no`）。字段可以用
`a.b.c` 指到里面。
These are the default field names. Yours may differ: the SuXin owner types your
names into the connection's field map (dot paths like `a.b.c` reach inside).

- 金额：默认是令吉 `12.50`；也可以设成 sen `1250`。 Money: ringgit `12.50` by default, or sen.
- 时间：ISO `2026-10-11T09:30:00+08:00`、毫秒或秒都可以。 Times: ISO, milliseconds or seconds.

### sales 销售

每一张单。SuXin 会：记成销售（Every Data 报表、Books 每日销售入账）、
并把卖掉的数量从库存扣掉（如果你的 WMS 也送库存，SuXin 老板可以关掉这一项）。

```json
{ "data": [
  {
    "id": "INV-000123",
    "receipt_no": "INV-000123",
    "created_at": "2026-10-11T09:30:00+08:00",
    "store_id": "KL01",
    "total": 23.00,
    "status": "completed",
    "payment_method": "cash",
    "items": [
      { "sku": "9555012345678", "name": "Milo 1kg", "quantity": 2, "price": 11.00 },
      { "sku": "", "name": "Plastic bag", "quantity": 1, "price": 1.00 }
    ]
  }
] }
```

- `status` 有 `void` / `cancel` / `refund` 字样就当作作废。
- `payment_method`：cash / card / qr / duitnow / tng / grab / wallet 会自动分类。
- `store_id` 是你的分店代号；SuXin 老板在连接里设「KL01 = kl」对上 SuXin 的分店。

### stock 库存数量

你的 WMS 现在每样货有多少。SuXin 当作一次盘点（每个地点每小时一份）。

```json
{ "data": [
  { "sku": "9555012345678", "name": "Milo 1kg", "quantity": 120, "location": "WH1" },
  { "sku": "9555000000017", "name": "Beras 5kg", "quantity": 34.5, "location": "WH1" }
] }
```

### items 商品和价钱

```json
{ "data": [
  { "sku": "9555012345678", "name": "Milo 1kg", "price": 18.90, "cost": 15.20, "category": "Minuman" }
] }
```

### deliveries 送货（TMS）

每一张送货单变成 SuXin TMS 的一趟行程（一个送货点），签收后显示在「签收单」。

```json
{ "data": [
  {
    "id": "DO-0042",
    "do_no": "DO-0042",
    "customer": "Restoran Ali",
    "address": "No. 12, Jalan Pasar, 30000 Ipoh",
    "status": "Delivered",
    "plate": "WXY 1234",
    "driver": "Ah Seng",
    "date": "2026-10-11T15:10:00+08:00",
    "received_by": "Encik Ali"
  }
] }
```

`status`：Created / Picking / Packing / Loaded / On road / Delivered / Cancelled
会自动对成 SuXin 的 已安排 / 装货中 / 在路上 / 完成 / 已取消。

---

## 4. 例子 · Examples

**curl**

```sh
curl -X POST "https://stockcheck-api-52988097941.asia-southeast1.run.app/connect/$COMPANY/$CONNECTION/sales" \
  -H "Authorization: Bearer $SUXIN_PUSH_KEY" \
  -H "Content-Type: application/json" \
  -d '{"data":[{"id":"INV-1","receipt_no":"INV-1","created_at":"2026-10-11T09:30:00+08:00","total":11,"items":[{"sku":"9555012345678","name":"Milo 1kg","quantity":1,"price":11}]}]}'
```

**Node.js（18 以上 / 18+）**

```js
const SUXIN = 'https://stockcheck-api-52988097941.asia-southeast1.run.app';
// The key comes from your own server's settings (an environment variable), never from the code.
const KEY = process.env.SUXIN_PUSH_KEY;

export async function pushToSuxin(company, connection, kind, records) {
  for (let i = 0; i < records.length; i += 1000) {
    const res = await fetch(`${SUXIN}/connect/${company}/${connection}/${kind}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: records.slice(i, i + 1000) }),
    });
    if (!res.ok) throw new Error(`SuXin ${res.status}: ${(await res.json()).error?.message}`);
    console.log(await res.json());
  }
}
```

**Python 3**

```python
import json, os, urllib.request

SUXIN = "https://stockcheck-api-52988097941.asia-southeast1.run.app"
KEY = os.environ["SUXIN_PUSH_KEY"]  # from your server's settings, never in the code

def push_to_suxin(company, connection, kind, records):
    for i in range(0, len(records), 1000):
        req = urllib.request.Request(
            f"{SUXIN}/connect/{company}/{connection}/{kind}",
            data=json.dumps({"data": records[i:i + 1000]}).encode(),
            headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as res:
            print(json.load(res))
```

**PHP**

```php
$ch = curl_init("https://stockcheck-api-52988097941.asia-southeast1.run.app/connect/$company/$connection/sales");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . getenv('SUXIN_PUSH_KEY'), 'Content-Type: application/json'],
  CURLOPT_POSTFIELDS => json_encode(['data' => $records]),
  CURLOPT_RETURNTRANSFER => true,
]);
echo curl_exec($ch);
```

建议：每卖一张单就送（或每 5 分钟送一批）；库存每小时送一次；送货单状态一改就送。
Suggested: send each sale as it happens (or every 5 minutes), stock every hour,
a delivery whenever its status changes.

---

## 5. PULL：SuXin 去你的 API 拿

如果你的系统已经有 REST API，SuXin 老板在连接选 **我们去他们的 API 拿**，填：

- **API 网址**，例如 `https://api.your-pos.com/v1/`（一定要 https，而且是公开网址）
- **钥匙方式**：`Authorization: Bearer <key>`、自己的 header（例如 `X-API-Key: <key>`）、或 Basic
- **钥匙**：由 SuXin 老板自己输入。钥匙只存在 SuXin 的服务器，任何画面都读不回来。
- 每种资料的 **路径**（例如 `sales`）、**列表在哪里**（例如 `data` 或 `result.rows`）、
  和 **「从…开始」参数**（例如 `updated_since`）

SuXin 每小时会这样问一次：

```
GET https://api.your-pos.com/v1/sales?updated_since=2026-10-11T08:50:00.000Z
Authorization: Bearer <key>
Accept: application/json
```

- 回答要是 JSON，最大 5 MB，20 秒内回答。
- 「从…开始」会比上次早 10 分钟，所以迟写的单不会漏；同一笔重复也只记一次。
- SuXin 老板可以按 **测试**：先看拿到什么，确定字段对了再保存。

---

## 6. 安全 · Security

- 钥匙（推送钥匙、你的 API 钥匙）放在服务器的设定里（环境变量），不要写在程序里，不要放进 GitHub。
- 只用 HTTPS。推送钥匙可以随时作废重做。
- SuXin 只会写进它自己的资料（销售、库存、商品、行程），不会改你的系统。
- Keys live in server settings (environment variables), never in code or in GitHub.
  HTTPS only. A push key can be replaced at any time; the old one stops working.

---

## 7. 问题 · Questions

- 送了没有显示？在 SuXin「连接」页看「上次拿」和每种资料的笔数、跳过的原因。
- 字段名字不同？请 SuXin 老板在「他们的字段名字」填你的名字。
- 分店对不上？请 SuXin 老板在「他们的分店代号」填 `你的代号 = SuXin 分店代号`。
