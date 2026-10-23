import {
  Activity, BadgeDollarSign, Bell, BookUser, Building2, CalendarCheck, CalendarDays, Camera, ClipboardList,
  FileText, HandCoins, HeartPulse, Home, KeyRound, LayoutDashboard, Megaphone, NotebookPen, PhoneCall,
  Receipt, ScrollText, Settings, ShieldAlert, ShieldCheck, Store, TrendingDown, TrendingUp, UserCircle,
  Landmark, Power, Users, Wallet, type LucideIcon,
} from "lucide-react";

export interface NavItem { label: string; href: string; icon: LucideIcon; perms?: string[] }
export interface NavGroup { label?: string; items: NavItem[] }

const ADMIN_NAV: NavGroup[] = [
  { items: [{ label: "Ringkasan", href: "/dashboard", icon: LayoutDashboard, perms: ["dashboard.admin"] }] },
  { label: "Kependudukan", items: [
    { label: "Data Warga", href: "/warga", icon: Users, perms: ["residents.view"] },
    { label: "Data Rumah", href: "/rumah", icon: Home, perms: ["units.view"] },
    { label: "Akun Pengguna", href: "/pengguna", icon: KeyRound, perms: ["users.manage"] },
  ] },
  { label: "Keuangan", items: [
    { label: "Master IPL", href: "/ipl/master", icon: ClipboardList, perms: ["ipl.manage"] },
    { label: "Tagihan IPL", href: "/ipl/tagihan", icon: Receipt, perms: ["ipl.view"] },
    { label: "Pembayaran IPL", href: "/ipl/pembayaran", icon: HandCoins, perms: ["ipl.view"] },
    { label: "IPL Belum Bayar", href: "/ipl/belum-bayar", icon: BadgeDollarSign, perms: ["ipl.view"] },
    { label: "Tunggakan", href: "/ipl/tunggakan", icon: Wallet, perms: ["ipl.view"] },
    { label: "Tunggakan Awal", href: "/ipl/tunggakan-awal", icon: Landmark, perms: ["ipl.view"] },
    { label: "Keuangan Masuk", href: "/keuangan/masuk", icon: TrendingUp, perms: ["finance.view"] },
    { label: "Keuangan Keluar", href: "/keuangan/keluar", icon: TrendingDown, perms: ["finance.view"] },
    { label: "Rekap Keuangan", href: "/keuangan/rekap", icon: ScrollText, perms: ["finance.view"] },
  ] },
  { label: "Administrasi", items: [
    { label: "Pengajuan Surat", href: "/surat", icon: FileText, perms: ["administration.view"] },
    { label: "Riwayat Pengajuan", href: "/surat/riwayat", icon: NotebookPen, perms: ["administration.view"] },
  ] },
  { label: "Lingkungan", items: [
    { label: "Pengumuman", href: "/pengumuman", icon: Megaphone, perms: ["announcements.manage"] },
    { label: "Kegiatan", href: "/kegiatan", icon: CalendarDays, perms: ["activities.manage"] },
    { label: "Fasilitas", href: "/fasilitas", icon: Building2, perms: ["facilities.manage"] },
    { label: "Booking Gedung", href: "/booking", icon: CalendarCheck, perms: ["facilities.manage"] },
    { label: "Direktori UMKM", href: "/umkm", icon: Store, perms: ["businesses.manage"] },
    { label: "Posyandu", href: "/posyandu", icon: HeartPulse, perms: ["posyandu.manage"] },
  ] },
  { label: "Keamanan", items: [
    { label: "Buku Tamu", href: "/buku-tamu", icon: BookUser, perms: ["security.visitors.view"] },
    { label: "Laporan Kejadian", href: "/kejadian", icon: ShieldAlert, perms: ["security.incidents.review", "security.incidents.manage"] },
    { label: "CCTV", href: "/cctv", icon: Camera, perms: ["cctv.view"] },
  ] },
  { label: "Sistem", items: [
    { label: "Role dan Permission", href: "/sistem/role", icon: ShieldCheck, perms: ["roles.view"] },
    { label: "Activity Log", href: "/sistem/log", icon: Activity, perms: ["audit_logs.view"] },
    { label: "Pengaturan", href: "/sistem/pengaturan", icon: Settings, perms: ["settings.manage"] },
    { label: "Kontrol Akses", href: "/sistem/kontrol", icon: Power, perms: ["system.access_control"] },
    { label: "Profil Saya", href: "/profil", icon: UserCircle },
  ] },
];

const MEMBER_NAV: NavGroup[] = [
  { items: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Profil Saya", href: "/profil", icon: UserCircle },
  ] },
  { label: "IPL", items: [
    { label: "Tagihan IPL", href: "/tagihan-saya", icon: Receipt, perms: ["ipl.self_view"] },
    { label: "Pembayaran IPL", href: "/ipl/pembayaran", icon: HandCoins, perms: ["ipl.payment_submit"] },
    { label: "Riwayat Pembayaran", href: "/riwayat-pembayaran", icon: ScrollText, perms: ["ipl.self_view"] },
  ] },
  { label: "Layanan", items: [
    { label: "Pengajuan Administrasi", href: "/pengajuan", icon: FileText, perms: ["administration.submit"] },
    { label: "Booking Gedung", href: "/booking", icon: CalendarCheck, perms: ["facilities.book"] },
    { label: "Booking Saya", href: "/booking-saya", icon: ClipboardList, perms: ["facilities.book"] },
  ] },
  { label: "Informasi", items: [
    { label: "Pengumuman", href: "/pengumuman", icon: Megaphone, perms: ["announcements.view"] },
    { label: "Kegiatan", href: "/kegiatan", icon: CalendarDays, perms: ["activities.view"] },
    { label: "UMKM Warga", href: "/umkm", icon: Store, perms: ["businesses.view"] },
    { label: "Informasi Posyandu", href: "/posyandu", icon: HeartPulse, perms: ["posyandu.view"] },
    { label: "Kontak Darurat", href: "/kontak-darurat", icon: PhoneCall },
  ] },
];

const SECURITY_NAV: NavGroup[] = [
  { items: [
    { label: "Dashboard Keamanan", href: "/dashboard", icon: LayoutDashboard },
    { label: "Buku Tamu", href: "/buku-tamu", icon: BookUser, perms: ["security.visitors.manage"] },
    { label: "Laporan Kejadian", href: "/kejadian", icon: ShieldAlert, perms: ["security.incidents.manage"] },
    { label: "CCTV", href: "/cctv", icon: Camera, perms: ["cctv.view"] },
    { label: "Pengumuman Keamanan", href: "/pengumuman", icon: Megaphone, perms: ["announcements.view"] },
    { label: "Kontak Darurat", href: "/kontak-darurat", icon: PhoneCall },
    { label: "Profil Saya", href: "/profil", icon: UserCircle },
  ] },
];

export function navFor(role: string, permissions: string[]): NavGroup[] {
  const tree = role === "MEMBER" ? MEMBER_NAV : role === "SECURITY" ? SECURITY_NAV : ADMIN_NAV;
  const perms = new Set(permissions);
  return tree
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.perms || i.perms.some((p) => perms.has(p))) }))
    .filter((g) => g.items.length > 0);
}

export { Bell };
