import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Info } from "lucide-react";

const REQUIRED_FIELDS: { field: string; description: string }[] = [
  { field: "date", description: "Борлуулалтын огноо" },
  { field: "brand", description: "Брэнд" },
  { field: "product", description: "Бүтээгдэхүүн / SKU" },
  { field: "qty", description: "Борлуулсан тоо хэмжээ" },
  { field: "sale_price", description: "Үндсэн худалдах үнэ" },
  { field: "sale_cost", description: "Нэгж бүтээгдэхүүний өртөг" },
  { field: "sales_channel", description: "Борлуулалтын суваг" },
  { field: "channel_type", description: "Сувгийн төрөл" },
  { field: "sales_type", description: "POS / Shipment зэрэг борлуулалтын төрөл" },
  { field: "return_qty", description: "Буцаалтын тоо" },
  { field: "net_qty", description: "Цэвэр борлуулалтын тоо" },
  { field: "stock_available", description: "Үлдэгдэл / боломжит нөөц" },
];

const RECOMMENDED_FIELDS: { field: string; description: string }[] = [
  { field: "discount_pct", description: "Хөнгөлөлтийн хувь" },
  { field: "promotion_pct", description: "Урамшуулал / promotion хувь" },
  { field: "shipment_qty", description: "Ачилтын тоо" },
  { field: "return_qty_units", description: "Буцаасан нэгж" },
  { field: "sale_price_net", description: "Хөнгөлөлтийн дараах нэгж үнэ" },
  { field: "total_sales", description: "Нийт борлуулалт" },
  { field: "discount", description: "Хөнгөлөлтийн мөнгөн дүн" },
  { field: "promotion", description: "Promotion / урамшууллын мөнгөн дүн" },
  { field: "refund_amount", description: "Буцаалтын мөнгөн дүн" },
  { field: "net_sales", description: "Цэвэр борлуулалтын орлого" },
];

function FieldTable({ rows }: { rows: { field: string; description: string }[] }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Талбар</TH>
          <TH>Тайлбар</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR key={r.field}>
            <TD className="font-mono text-xs text-ink-800">{r.field}</TD>
            <TD>{r.description}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

export function ExcelRequirementCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Excel файл ямар мэдээлэл агуулсан байх ёстой вэ?
        </CardTitle>
        <CardDescription>
          Баганын нэрийг систем автоматаар танина (жишээ нь &ldquo;Total Sales&rdquo; →
          total_sales, &ldquo;Discount &rdquo; → discount).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <p className="section-label mb-2">Заавал шаардлагатай үндсэн талбарууд</p>
          <FieldTable rows={REQUIRED_FIELDS} />
        </div>
        <div>
          <p className="section-label mb-2">Санал болгож буй хүчин зүйлийн талбарууд</p>
          <FieldTable rows={RECOMMENDED_FIELDS} />
        </div>
        <div className="flex gap-3 rounded-xl border border-accent-200 bg-accent-50/70 p-4 text-sm text-accent-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Илүү урт хугацааны өгөгдөл нь хүчин зүйлийн шинжилгээг илүү найдвартай болгоно.
            Боломжтой бол хамгийн багадаа 30–90 хоногийн борлуулалтын түүх оруулна уу.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
