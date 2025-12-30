/**
 * Script to clean invalid phone numbers (LIDs and malformed numbers) from database
 *
 * Usage:
 *   npx tsx src/scripts/cleanInvalidPhones.ts
 *
 * Options:
 *   --dry-run    Show what would be cleaned without actually deleting
 *   --fix        Attempt to fix numbers using pattern extraction
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Phone validation patterns for Arab countries
const VALID_PATTERNS = [
  /(20[1][0-9]{9})/,      // Egypt: 201xxxxxxxxx
  /(966[5][0-9]{8})/,     // Saudi: 9665xxxxxxxx
  /(971[5][0-9]{8})/,     // UAE: 9715xxxxxxxx
  /(965[569][0-9]{7})/,   // Kuwait: 9655xxxxxxx, 9656xxxxxxx, 9659xxxxxxx
  /(968[79][0-9]{7})/,    // Oman: 9687xxxxxxx, 9689xxxxxxx
  /(974[3567][0-9]{7})/,  // Qatar: 9743xxxxxxx, etc.
  /(973[3][0-9]{7})/,     // Bahrain: 9733xxxxxxx
  /(962[7][0-9]{8})/,     // Jordan: 9627xxxxxxxx
  /(961[3-9][0-9]{7})/,   // Lebanon: 9613xxxxxxx to 9619xxxxxxx
  /(212[6-7][0-9]{8})/,   // Morocco: 2126xxxxxxxx, 2127xxxxxxxx
  /(213[5-7][0-9]{8})/,   // Algeria: 2135xxxxxxxx to 2137xxxxxxxx
  /(216[2-9][0-9]{7})/,   // Tunisia: 2162xxxxxxx to 2169xxxxxxx
];

interface PhoneRecord {
  id: string;
  phone: string;
  name?: string;
  organization_id: string;
}

/**
 * Validate if a phone number is valid
 */
function isValidPhone(phone: string): boolean {
  const clean = phone.replace(/\D/g, '');

  // Too short or too long
  if (clean.length < 10 || clean.length > 15) {
    return false;
  }

  // Known invalid patterns (WhatsApp internal IDs)
  if (clean.startsWith('4203') || clean.startsWith('4204')) {
    return false;
  }

  return true;
}

/**
 * Try to extract a valid phone from a LID
 */
function extractValidPhone(phone: string): string | null {
  const clean = phone.replace(/\D/g, '');

  // If already valid length, return as is
  if (clean.length >= 10 && clean.length <= 15) {
    return clean;
  }

  // Try pattern extraction for LIDs
  for (const pattern of VALID_PATTERNS) {
    const match = clean.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Clean invalid phones from customers table
 */
async function cleanCustomers(dryRun: boolean, fix: boolean): Promise<{
  total: number;
  invalid: number;
  fixed: number;
  deleted: number;
}> {
  console.log('\n📋 Checking customers table...');

  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, phone, name, organization_id');

  if (error) {
    console.error('❌ Error fetching customers:', error);
    return { total: 0, invalid: 0, fixed: 0, deleted: 0 };
  }

  if (!customers || customers.length === 0) {
    console.log('ℹ️  No customers found');
    return { total: 0, invalid: 0, fixed: 0, deleted: 0 };
  }

  const stats = {
    total: customers.length,
    invalid: 0,
    fixed: 0,
    deleted: 0
  };

  console.log(`ℹ️  Found ${customers.length} customers`);

  for (const customer of customers as PhoneRecord[]) {
    if (!customer.phone) {
      continue;
    }

    const valid = isValidPhone(customer.phone);

    if (!valid) {
      stats.invalid++;
      console.log(`❌ Invalid: ${customer.phone} (${customer.name || 'No name'})`);

      if (fix) {
        const extracted = extractValidPhone(customer.phone);
        if (extracted) {
          console.log(`   ✅ Can fix: ${customer.phone} → ${extracted}`);

          if (!dryRun) {
            const { error: updateError } = await supabase
              .from('customers')
              .update({ phone: extracted, updated_at: new Date().toISOString() })
              .eq('id', customer.id);

            if (updateError) {
              console.error(`   ⚠️  Failed to update: ${updateError.message}`);
            } else {
              stats.fixed++;
              console.log(`   ✅ Fixed!`);
            }
          } else {
            stats.fixed++;
          }
        } else {
          console.log(`   ⚠️  Cannot extract valid phone, will delete`);

          if (!dryRun) {
            const { error: deleteError } = await supabase
              .from('customers')
              .delete()
              .eq('id', customer.id);

            if (deleteError) {
              console.error(`   ⚠️  Failed to delete: ${deleteError.message}`);
            } else {
              stats.deleted++;
              console.log(`   🗑️  Deleted!`);
            }
          } else {
            stats.deleted++;
          }
        }
      } else {
        // Just delete invalid ones
        if (!dryRun) {
          const { error: deleteError } = await supabase
            .from('customers')
            .delete()
            .eq('id', customer.id);

          if (deleteError) {
            console.error(`   ⚠️  Failed to delete: ${deleteError.message}`);
          } else {
            stats.deleted++;
            console.log(`   🗑️  Deleted!`);
          }
        } else {
          stats.deleted++;
        }
      }
    }
  }

  return stats;
}

/**
 * Clean invalid phones from contacts table
 */
async function cleanContacts(dryRun: boolean, fix: boolean): Promise<{
  total: number;
  invalid: number;
  fixed: number;
  deleted: number;
}> {
  console.log('\n📇 Checking contacts table...');

  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, phone, name, organization_id');

  if (error) {
    console.error('❌ Error fetching contacts:', error);
    return { total: 0, invalid: 0, fixed: 0, deleted: 0 };
  }

  if (!contacts || contacts.length === 0) {
    console.log('ℹ️  No contacts found');
    return { total: 0, invalid: 0, fixed: 0, deleted: 0 };
  }

  const stats = {
    total: contacts.length,
    invalid: 0,
    fixed: 0,
    deleted: 0
  };

  console.log(`ℹ️  Found ${contacts.length} contacts`);

  for (const contact of contacts as PhoneRecord[]) {
    if (!contact.phone) {
      continue;
    }

    const valid = isValidPhone(contact.phone);

    if (!valid) {
      stats.invalid++;
      console.log(`❌ Invalid: ${contact.phone} (${contact.name || 'No name'})`);

      if (fix) {
        const extracted = extractValidPhone(contact.phone);
        if (extracted) {
          console.log(`   ✅ Can fix: ${contact.phone} → ${extracted}`);

          if (!dryRun) {
            const { error: updateError } = await supabase
              .from('contacts')
              .update({ phone: extracted, updated_at: new Date().toISOString() })
              .eq('id', contact.id);

            if (updateError) {
              console.error(`   ⚠️  Failed to update: ${updateError.message}`);
            } else {
              stats.fixed++;
              console.log(`   ✅ Fixed!`);
            }
          } else {
            stats.fixed++;
          }
        } else {
          console.log(`   ⚠️  Cannot extract valid phone, will delete`);

          if (!dryRun) {
            const { error: deleteError } = await supabase
              .from('contacts')
              .delete()
              .eq('id', contact.id);

            if (deleteError) {
              console.error(`   ⚠️  Failed to delete: ${deleteError.message}`);
            } else {
              stats.deleted++;
              console.log(`   🗑️  Deleted!`);
            }
          } else {
            stats.deleted++;
          }
        }
      } else {
        // Just delete invalid ones
        if (!dryRun) {
          const { error: deleteError } = await supabase
            .from('contacts')
            .delete()
            .eq('id', contact.id);

          if (deleteError) {
            console.error(`   ⚠️  Failed to delete: ${deleteError.message}`);
          } else {
            stats.deleted++;
            console.log(`   🗑️  Deleted!`);
          }
        } else {
          stats.deleted++;
        }
      }
    }
  }

  return stats;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fix = args.includes('--fix');

  console.log('🧹 Phone Number Cleanup Script');
  console.log('================================');

  if (dryRun) {
    console.log('ℹ️  DRY RUN MODE - No changes will be made');
  }

  if (fix) {
    console.log('ℹ️  FIX MODE - Will attempt to extract valid phones from LIDs');
  }

  console.log('');

  // Clean customers
  const customerStats = await cleanCustomers(dryRun, fix);

  // Clean contacts
  const contactStats = await cleanContacts(dryRun, fix);

  // Print summary
  console.log('\n📊 Summary');
  console.log('==========');
  console.log('\n👥 Customers:');
  console.log(`   Total: ${customerStats.total}`);
  console.log(`   Invalid: ${customerStats.invalid}`);
  if (fix) {
    console.log(`   Fixed: ${customerStats.fixed}`);
  }
  console.log(`   Deleted: ${customerStats.deleted}`);

  console.log('\n📇 Contacts:');
  console.log(`   Total: ${contactStats.total}`);
  console.log(`   Invalid: ${contactStats.invalid}`);
  if (fix) {
    console.log(`   Fixed: ${contactStats.fixed}`);
  }
  console.log(`   Deleted: ${contactStats.deleted}`);

  const totalInvalid = customerStats.invalid + contactStats.invalid;
  const totalFixed = customerStats.fixed + contactStats.fixed;
  const totalDeleted = customerStats.deleted + contactStats.deleted;

  console.log('\n🎯 Total:');
  console.log(`   Invalid: ${totalInvalid}`);
  if (fix) {
    console.log(`   Fixed: ${totalFixed}`);
  }
  console.log(`   Deleted: ${totalDeleted}`);

  if (dryRun) {
    console.log('\n⚠️  This was a dry run. Run without --dry-run to apply changes.');
  } else {
    console.log('\n✅ Cleanup completed!');
  }
}

main().catch(console.error);
