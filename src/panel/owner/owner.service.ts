import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { hashCpf, normalizeCpf, isValidCpf } from '../../common/cpf';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeUrl, normalizePhone, normalizeCep } from '../panel.utils';

// Perfil do dono e troca de senha. CPF é write-only: entra hasheado e nunca
// sai — a tela só sabe se existe um cadastrado (hasCpf), nunca o número.
//
// Único service do painel que recebe ownerId, e não businessId: o que ele mexe
// é a pessoa, não o negócio. Os dois vêm do JWT.
//
// Nasceu do PanelService, que tinha 1028 linhas e cinco assuntos dentro.
@Injectable()
export class OwnerService {
  constructor(
    private prisma: PrismaService,
  ) {}

  // Nunca selecionamos cpfHash pra fora: o CPF é write-only. A página só sabe
  // se há um cadastrado (hasCpf), nunca o número.
  private static readonly OWNER_SELECT = {
    id: true,
    email: true,
    name: true,
    phone: true,
    cpfHash: true,
    passwordHash: true,
    cep: true,
    photoUrl: true,
  } as const;

  // Tira cpfHash/passwordHash do retorno (write-only) e expõe só os booleanos:
  // hasCpf e hasPassword (contas nascidas por login social não têm senha).
  private presentOwner<T extends { cpfHash: string | null; passwordHash: string | null }>(
    owner: T,
  ) {
    const { cpfHash, passwordHash, ...rest } = owner;
    return { ...rest, hasCpf: cpfHash !== null, hasPassword: passwordHash !== null };
  }

  async getOwner(ownerId: string) {
    const owner = await this.prisma.owner.findUniqueOrThrow({
      where: { id: ownerId },
      select: OwnerService.OWNER_SELECT,
    });
    return this.presentOwner(owner);
  }

  async updateOwner(
    ownerId: string,
    input: {
      name?: string;
      phone?: string;
      cpf?: string;
      cep?: string;
      photoUrl?: string;
    },
  ) {
    const data: Record<string, unknown> = {};

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException('O nome não pode ficar vazio.');
      data.name = name;
    }
    if (input.phone !== undefined) data.phone = normalizePhone(input.phone);
    if (input.cep !== undefined) data.cep = normalizeCep(input.cep);
    if (input.photoUrl !== undefined) data.photoUrl = normalizeUrl(input.photoUrl);

    // CPF é write-only: campo vazio = "não mexe" (não apaga o que já existe).
    // Só com valor: valida, hashea e checa unicidade contra os outros donos.
    if (input.cpf !== undefined && input.cpf.trim() !== '') {
      // Valida os dígitos verificadores ANTES de hashear: como o CPF é
      // blind-index (write-only), um valor inválido gravado nunca mais pode ser
      // lido pra conferir — entra lixo permanente. isValidCpf já existe e só
      // não era chamado.
      if (!isValidCpf(input.cpf)) {
        throw new BadRequestException('CPF inválido.');
      }
      const cpfHash = hashCpf(normalizeCpf(input.cpf));
      const clash = await this.prisma.owner.findUnique({
        where: { cpfHash },
        select: { id: true },
      });
      if (clash && clash.id !== ownerId) {
        throw new ConflictException('Este CPF já está em uso por outra conta.');
      }
      data.cpfHash = cpfHash;
    }

    const owner = await this.prisma.owner.update({
      where: { id: ownerId },
      data,
      select: OwnerService.OWNER_SELECT,
    });
    return this.presentOwner(owner);
  }

  /**
   * Define ou troca a senha do dono. Conta nascida por login social não tem
   * senha: aqui ela ganha uma (passa a poder entrar por email/senha também).
   * Se JÁ existe senha, exige a atual (evita troca silenciosa por sessão
   * sequestrada). Não desloga a sessão atual.
   */
  async setPassword(
    ownerId: string,
    input: { currentPassword?: string; newPassword?: string },
  ) {
    const newPassword = input.newPassword ?? '';
    if (newPassword.length < 8) {
      throw new BadRequestException('A senha precisa de ao menos 8 caracteres.');
    }

    const owner = await this.prisma.owner.findUniqueOrThrow({
      where: { id: ownerId },
      select: { passwordHash: true },
    });

    // Já tem senha? Então isto é uma TROCA: confira a senha atual.
    if (owner.passwordHash) {
      const ok = input.currentPassword
        ? await argon2.verify(owner.passwordHash, input.currentPassword)
        : false;
      if (!ok) throw new UnauthorizedException('Senha atual incorreta.');
    }

    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.owner.update({ where: { id: ownerId }, data: { passwordHash } });
    return { ok: true };
  }
}
