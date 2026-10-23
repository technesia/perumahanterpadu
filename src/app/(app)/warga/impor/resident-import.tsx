"use client";
import { useRouter } from "next/navigation";
import { ImportPanel } from "@/components/domain/import-panel";
import { confirmResidentImportAction, previewResidentImportAction } from "./actions";

export function ResidentImport() {
  const router = useRouter();
  return (
    <ImportPanel
      templateHref="/api/templates/data-warga" templateLabel="Template Data Warga"
      preview={previewResidentImportAction} confirm={confirmResidentImportAction}
      columns={[{ key: "name", label: "Nama" }, { key: "nik", label: "NIK" }, { key: "house", label: "No Rumah" }, { key: "occupancy", label: "Status Hunian" }]}
      onDone={() => router.push("/warga")}
    />
  );
}
