import * as assert from 'assert';
import { analyzeJavaMetadata } from '../scanner/javaScanner';

suite('Java Scanner', () => {
    test('detects Maven, Java, and Spring Boot from Maven metadata', () => {
        const result = analyzeJavaMetadata({
            pomXml: '<plugin>maven-compiler-plugin</plugin><artifactId>spring-boot-starter-web</artifactId>'
        });

        assert.deepStrictEqual(result.technologies, ['Maven', 'Java', 'Spring Boot']);
    });

    test('detects Gradle, Kotlin, and Spring Boot from explicit plugins', () => {
        const result = analyzeJavaMetadata({
            buildGradleKts: 'plugins { kotlin("jvm") version "2.0"; id("org.springframework.boot") version "3.0" }'
        });

        assert.deepStrictEqual(result.technologies, ['Gradle', 'Kotlin', 'Spring Boot']);
    });

    test('does not infer Java or Spring Boot from an empty Gradle file', () => {
        assert.deepStrictEqual(
            analyzeJavaMetadata({ buildGradle: '' }).technologies,
            ['Gradle']
        );
    });
});
