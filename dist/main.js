"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
const _core = require("@nestjs/core");
const _common = require("@nestjs/common");
const _swagger = require("@nestjs/swagger");
const _appmodule = require("./app.module");
const _allexceptionsfilter = require("./common/filters/all-exceptions.filter");
const _logginginterceptor = require("./common/interceptors/logging.interceptor");
async function bootstrap() {
    const app = await _core.NestFactory.create(_appmodule.AppModule, {
        rawBody: true
    });
    // Global Validation Pipe
    app.useGlobalPipes(new _common.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
        transformOptions: {
            enableImplicitConversion: true
        }
    }));
    // Global Exception Filter
    app.useGlobalFilters(new _allexceptionsfilter.AllExceptionsFilter());
    // Global Logging Interceptor
    app.useGlobalInterceptors(new _logginginterceptor.LoggingInterceptor());
    // CORS
    app.enableCors({
        origin: process.env.NODE_ENV === 'production' ? false : '*',
        methods: [
            'GET',
            'POST',
            'PUT',
            'PATCH',
            'DELETE',
            'OPTIONS'
        ],
        credentials: true
    });
    // Swagger/OpenAPI
    const config = new _swagger.DocumentBuilder().setTitle('MediSchedule AI Call Agent API').setDescription('AI-powered outbound call agent for medical appointment scheduling. ' + 'This POC uses Google Gemini + LangChain.js + Twilio to automatically ' + 'call patients and confirm, cancel, or reschedule appointments.').setVersion('1.0.0').addTag('AI Call', 'AI calling agent endpoints').addTag('Patients', 'Patient management').addTag('Appointments', 'Appointment management').addServer(`http://localhost:${process.env.PORT || 3000}`, 'Local Development').build();
    const document = _swagger.SwaggerModule.createDocument(app, config);
    _swagger.SwaggerModule.setup('api', app, document, {
        swaggerOptions: {
            persistAuthorization: true,
            tagsSorter: 'alpha'
        },
        customSiteTitle: 'MediSchedule AI Agent API'
    });
    const port = process.env.PORT || 3000;
    await app.listen(port);
    console.log(`🚀 MediSchedule AI Call Agent running on: http://localhost:${port}`);
    console.log(`📖 Swagger UI: http://localhost:${port}/api`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
}
bootstrap();

//# sourceMappingURL=main.js.map