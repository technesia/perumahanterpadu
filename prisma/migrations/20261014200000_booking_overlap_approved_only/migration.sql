-- Exclusion constraint kini hanya untuk booking DISETUJUI: dua booking yang disetujui
-- tidak akan pernah bertabrakan. Penahanan slot "Menunggu Review" ditegakkan aplikasi
-- (advisory lock per fasilitas) sesuai pengaturan organizations.holdPendingBookings.
ALTER TABLE "facility_bookings" DROP CONSTRAINT "facility_bookings_no_overlap";
ALTER TABLE "facility_bookings"
  ADD CONSTRAINT "facility_bookings_no_overlap"
  EXCLUDE USING gist ("facilityId" WITH =, tsrange("startAt", "endAt", '[)') WITH &&)
  WHERE ("status" = 'APPROVED');
