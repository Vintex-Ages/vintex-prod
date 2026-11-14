export type VideoPlayerProps = {
  src: string;
  label: string;
};

/**
 * Player do vídeo curto da peça (FE-US012-3) — só apresentação, sem regra de
 * negócio. Usa os controles nativos do `<video>`; quem decide quando exibi-lo
 * (ex.: item ativo da galeria ser `type: 'video'`) é responsabilidade de quem
 * chama, não deste componente.
 *
 * Usage:
 *   import VideoPlayer from '@/components/product/VideoPlayer';
 *   <VideoPlayer src={media.url} label={`${productName} — vídeo 1 de 3`} />
 */
function VideoPlayer({ src, label }: VideoPlayerProps) {
  return <video src={src} controls className="h-full w-full object-cover" aria-label={label} />;
}

export default VideoPlayer;
