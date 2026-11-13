<?php

declare(strict_types=1);

namespace Gorontalokota\Sso\Tests;

use Gorontalokota\Sso\SsoUser;
use PHPUnit\Framework\TestCase;

final class SsoUserTest extends TestCase
{
    public function test_employment_uses_english_claim_names(): void
    {
        $user = SsoUser::fromClaims([
            'sub' => 'account-1',
            'organization_code' => '1.01',
            'organization_name' => 'Dinas Pendidikan',
            'position' => 'Analis Kebijakan',
            'grade' => 'III/c',
            'employment_status' => 'PNS',
        ]);

        self::assertSame([
            'organization_code' => '1.01',
            'organization_name' => 'Dinas Pendidikan',
            'position' => 'Analis Kebijakan',
            'grade' => 'III/c',
            'employment_status' => 'PNS',
        ], $user->employment());
    }

    public function test_internal_contact_nik_and_photo_claims(): void
    {
        $user = SsoUser::fromClaims([
            'sub' => 'account-1',
            'phone_number' => '+6281234567890',
            'phone_number_verified' => true,
            'nik' => '7571000000000001',
            'photo' => '199001012020011001.png',
        ]);

        self::assertSame('+6281234567890', $user->phoneNumber());
        self::assertTrue($user->phoneNumberVerified());
        self::assertSame('7571000000000001', $user->nik());
        self::assertSame('199001012020011001.png', $user->photo());
        self::assertNull($user->picture());
        self::assertNull(SsoUser::fromClaims(['sub' => 'account-2'])->phoneNumberVerified());
    }

    public function test_legacy_indonesian_claim_names_from_older_servers_still_work(): void
    {
        $user = SsoUser::fromClaims(['sub' => 'account-1', 'opd_kode' => '1.02', 'jabatan' => 'Pranata Komputer', 'tingkat_akun' => 'L2']);

        self::assertSame('1.02', $user->employment()['organization_code']);
        self::assertSame('Pranata Komputer', $user->employment()['position']);
        self::assertNull($user->employment()['grade']);
        self::assertSame('L2', $user->verificationLevel());
    }
}
