package com.truemark.demo.helloworld;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class VersionController {

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    public static class Version {
        private String version;
    }

    @RequestMapping("/version")
    public Object version() {
        return new Version(getClass().getPackage().getImplementationVersion());
    }

}
