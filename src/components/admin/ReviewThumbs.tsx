'use client';
import { PhotoGallery } from '@/components/record/PhotoGallery';

export function ReviewThumbs({ photos }: { photos: { id: string; url: string }[] }) {
  return <div className="mt-2"><PhotoGallery photos={photos} /></div>;
}
