import {
  bootstrapApplication,
  provideNativeScriptHttpClient,
  provideNativeScriptNgZone,
  provideNativeScriptRouter,
  runNativeScriptAngularApp,
} from '@nativescript/angular';
import { withInterceptorsFromDi, withInterceptors } from '@angular/common/http';
import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { authInterceptor } from './app/services/auth.interceptor';

runNativeScriptAngularApp({
  appModuleBootstrap: () => {
    return bootstrapApplication(AppComponent, {
      providers: [
        provideNativeScriptNgZone(),
        provideNativeScriptHttpClient(
          withInterceptorsFromDi(),
          withInterceptors([authInterceptor])
        ),
        provideNativeScriptRouter(routes),
      ],
    }).catch(err => {
      console.error('=== PEI BOOTSTRAP ERROR ===');
      console.error('Message:', err?.message);
      console.error('Stack:', err?.stack);
      throw err;
    });
  },
});
