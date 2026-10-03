-- 1. Create Triggers on auth.users for glowix_books schema
DROP TRIGGER IF EXISTS on_auth_user_created_glowix_books ON auth.users;
CREATE TRIGGER on_auth_user_created_glowix_books
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION glowix_books.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_role_glowix_books ON auth.users;
CREATE TRIGGER on_auth_user_role_glowix_books
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION glowix_books.handle_new_user_role();

DROP TRIGGER IF EXISTS on_auth_user_settings_glowix_books ON auth.users;
CREATE TRIGGER on_auth_user_settings_glowix_books
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION glowix_books.handle_new_user_settings();
