import { requirePage } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ResidentImport } from "./resident-import";

export const metadata = { title: "Impor Data Warga" };

export default async function ResidentImportPage() {
  await requirePage("residents.create");
  return (
    <>
      <PageHeader title="Impor Data Warga" description="Tambah banyak warga sekaligus dari Excel. Impor hanya menambah warga baru; data yang sudah ada tidak diubah."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Data Warga", href: "/warga" }, { label: "Impor Excel" }]} />
      <Card>
        <CardHeader title="Impor dari Excel" description="Unduh template, isi data warga, unggah, periksa pratinjau, lalu konfirmasi. Data tidak disimpan sebelum dikonfirmasi." />
        <CardBody><ResidentImport /></CardBody>
      </Card>
    </>
  );
}
