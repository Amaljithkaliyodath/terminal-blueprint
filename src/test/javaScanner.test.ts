import * as assert from 'assert';
import { analyzeJavaMetadata } from '../scanner/javaScanner';

suite('Java Scanner', () => {
    test('detects Maven, Java, and Spring Boot from Maven metadata', () => {
        const result = analyzeJavaMetadata({
            pomXml: '<project><modelVersion>4.0.0</modelVersion><plugin>maven-compiler-plugin</plugin><artifactId>spring-boot-starter-web</artifactId></project>'
        });

        assert.deepStrictEqual(result.technologies, ['Maven', 'Java', 'Spring Boot']);
    });

    test('detects Gradle, Kotlin, and Spring Boot from explicit plugins', () => {
        const result = analyzeJavaMetadata({
            buildGradleKts: 'plugins { kotlin("jvm") version "2.0"; id("org.springframework.boot") version "3.0" }'
        });

        assert.deepStrictEqual(result.technologies, ['Gradle', 'Kotlin', 'Spring Boot']);
    });

    test('rejects blank, comments-only, unrelated, and incomplete Gradle metadata', () => {
        for (const buildGradle of ['', '  \n\t', '// comment only\n/* still a comment */', 'not a Gradle build', 'plugins {']) {
            assert.deepStrictEqual(analyzeJavaMetadata({ buildGradle }).technologies, []);
        }
    });

    test('detects verified Groovy and Kotlin Gradle DSL metadata', () => {
        assert.deepStrictEqual(
            analyzeJavaMetadata({ buildGradle: "plugins { id 'java' }" }).technologies,
            ['Gradle', 'Java']
        );
        assert.deepStrictEqual(
            analyzeJavaMetadata({ buildGradleKts: 'plugins { id("java") }' }).technologies,
            ['Gradle', 'Java']
        );
    });

    test('rejects empty, malformed, and unrelated Maven XML', () => {
        for (const pomXml of ['', '<project />', '<project><modelVersion>4.0.0</modelVersion>', '<configuration><modelVersion>4.0.0</modelVersion></configuration>']) {
            assert.deepStrictEqual(analyzeJavaMetadata({ pomXml }).technologies, []);
        }
    });

    test('detects a valid multi-module Maven POM', () => {
        const result = analyzeJavaMetadata({
            pomXml: '<project><modelVersion>4.0.0</modelVersion><packaging>pom</packaging><modules><module>api</module></modules></project>'
        });

        assert.deepStrictEqual(result.technologies, ['Maven']);
    });
});
