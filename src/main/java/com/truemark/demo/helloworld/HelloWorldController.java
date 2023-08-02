package com.truemark.demo.helloworld;

import lombok.Data;
import lombok.experimental.Accessors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.Enumeration;

@RestController
@Slf4j
public class HelloWorldController {

    // This value comes from application.yml or if set an environment variables called MESSAGE
    @Value("${message}")
    private String message;

    @Data
    @Accessors(chain = true)
    public static class Hello {
        private String message;
    }

    private void logRequest(HttpServletRequest req) {
        String str = "\nIngress Request:\n" +
                "  URI:       %s\n" +
                "  Scheme:    %s\n" +
                "  Protocol:  %s\n" +
                "  Server:    %s:%d\n" +
                "  Headers:\n%s\n";
        StringBuilder headers = new StringBuilder();
        Enumeration<String> names = req.getHeaderNames();
        while (names.hasMoreElements()) {
            String name = names.nextElement();
            Enumeration<String> values = req.getHeaders(name);
            while (values.hasMoreElements()) {
                String value = values.nextElement();
                headers.append("    ").append(name).append(": ").append(value).append("\n");
            }
        }
        str = String.format(str,
                req.getRequestURI(),
                req.getScheme(),
                req.getProtocol(),
                req.getServerName(),
                req.getServerPort(),
                headers);
        log.trace(str);
    }

    @RequestMapping(value = "**")
    public ResponseEntity<Hello> hello(HttpServletRequest req) {
        if (log.isTraceEnabled()) {
            logRequest(req);
        }
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new Hello().setMessage(message));
    }

}
