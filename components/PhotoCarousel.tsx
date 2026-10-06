import { ImageOff } from "lucide-react";
import { viewUrl } from "@/lib/photos";
import type { ItemPhoto } from "@/lib/types";

export default function PhotoCarousel({ photos, alt }: { photos: ItemPhoto[]; alt: string }) {
  if (photos.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center bg-page text-ink-faint">
        <ImageOff className="h-10 w-10" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex aspect-square w-full snap-x snap-mandatory overflow-x-auto">
        {photos.map((photo, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={photo.id}
            src={viewUrl(photo)}
            alt={alt}
            loading={i === 0 ? "eager" : "lazy"}
            decoding="async"
            className="h-full w-full shrink-0 snap-center object-cover"
          />
        ))}
      </div>
      {photos.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5" aria-hidden="true">
          {photos.map((photo) => (
            <span key={photo.id} className="h-1.5 w-1.5 rounded-full bg-line-strong" />
          ))}
        </div>
      )}
    </div>
  );
}
