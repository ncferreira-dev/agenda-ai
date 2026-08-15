import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { requiredInProd } from '../common/env';

// Extensão derivada do TIPO real, num allowlist — nunca do nome do arquivo, que
// o cliente controla. Sem isto, mandar "evil.html" (ou um SVG, que executa
// script) fazia a chave herdar `.html`/`.svg` e a própria API servia o arquivo
// como HTML/SVG => XSS hospedado no nosso domínio. Só imagem raster passa.
const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

// ---------------------------------------------------------------------------
// Storage plugável das imagens (logo/capa). Init preguiçoso, degradação graciosa
// (mesmo padrão do Push):
//
//   - Sem envs de S3 → grava em disco local (uploads/) e serve por /uploads.
//     Ótimo pra dev; em deploy efêmero (container/Heroku) as imagens somem no
//     restart — por isso, EM PRODUÇÃO defina o storage S3-compatível.
//   - Com S3_BUCKET (+ credenciais) → sobe pro object storage S3-compatível
//     (AWS S3, Cloudflare R2, Supabase, Backblaze, MinIO…). Persistente e
//     multi-instância.
//
// A escolha é por env, então o resto do código não muda ao trocar de backend.
// ---------------------------------------------------------------------------

export const UPLOADS_DIR = join(process.cwd(), 'uploads');

export interface StoredFile {
  /** URL pública final da imagem. */
  url: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  // Config S3 (opcional). endpoint permite R2/Supabase/MinIO; region default us-east-1.
  private readonly bucket = process.env.S3_BUCKET ?? '';
  private readonly region = process.env.S3_REGION ?? 'us-east-1';
  private readonly endpoint = process.env.S3_ENDPOINT || undefined;
  // publicBase: base das URLs públicas (CDN/custom domain). Se vazio, monta a
  // partir de endpoint/bucket (path-style) — funciona pra MinIO/R2 com acesso público.
  private readonly publicBase = process.env.S3_PUBLIC_URL ?? '';
  private readonly forcePathStyle = process.env.S3_FORCE_PATH_STYLE !== 'false';

  private s3: S3Client | null = null;

  /** true quando o backend é S3-compatível (produção recomendada). */
  get usesS3(): boolean {
    return Boolean(this.bucket);
  }

  private getS3(): S3Client {
    if (!this.s3) {
      const accessKeyId = process.env.S3_ACCESS_KEY_ID;
      const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
      this.s3 = new S3Client({
        region: this.region,
        endpoint: this.endpoint,
        forcePathStyle: this.forcePathStyle,
        // Credenciais explícitas quando fornecidas; senão cai na cadeia padrão
        // do SDK (IAM role, ~/.aws, etc.).
        ...(accessKeyId && secretAccessKey
          ? { credentials: { accessKeyId, secretAccessKey } }
          : {}),
      });
    }
    return this.s3;
  }

  /**
   * Persiste um arquivo de imagem e devolve a URL pública.
   * Nome aleatório (UUID) preservando a extensão original.
   */
  async put(file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
  }): Promise<StoredFile> {
    const ext = EXT_BY_MIME[file.mimetype];
    if (!ext) {
      throw new BadRequestException(
        'Formato de imagem não suportado. Use PNG, JPG, WEBP ou GIF.',
      );
    }
    const key = `${randomUUID()}${ext}`;

    if (this.usesS3) {
      await this.getS3().send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      return { url: this.s3PublicUrl(key) };
    }

    // Fallback local (dev). Persistente só enquanto o disco existir.
    mkdirSync(UPLOADS_DIR, { recursive: true });
    writeFileSync(join(UPLOADS_DIR, key), file.buffer);
    if (process.env.NODE_ENV === 'production') {
      this.logger.warn(
        'Upload gravado em disco local em produção — configure S3_BUCKET para storage persistente.',
      );
    }
    // PUBLIC_API_URL é obrigatória em prod pra montar a URL da imagem (senão
    // apontaria pra localhost). Só é exigida aqui, no caminho de disco local.
    const base = requiredInProd('PUBLIC_API_URL', `http://localhost:${process.env.PORT ?? 3000}`);
    return { url: `${base}/uploads/${key}` };
  }

  private s3PublicUrl(key: string): string {
    if (this.publicBase) return `${this.publicBase.replace(/\/$/, '')}/${key}`;
    if (this.endpoint) {
      return `${this.endpoint.replace(/\/$/, '')}/${this.bucket}/${key}`;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }
}
