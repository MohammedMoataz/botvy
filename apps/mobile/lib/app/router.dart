import 'package:go_router/go_router.dart';

import '../features/auth/presentation/sign_in_page.dart';

abstract final class Routes {
  static const String signIn = '/sign-in';
}

/// P0 has one destination. The signed-in shell arrives with the features that
/// need it; a redirect guard belongs there too, not here, where there is
/// nothing yet to guard.
final GoRouter appRouter = GoRouter(
  initialLocation: Routes.signIn,
  routes: [
    GoRoute(
      path: Routes.signIn,
      builder: (context, state) => const SignInPage(),
    ),
  ],
);
