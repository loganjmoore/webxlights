/*{
  "DESCRIPTION": "Random sparkles twinkling over a solid background color",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "baseColor", "TYPE": "color", "DEFAULT": [0.0, 0.2, 0.0, 1.0] },
    { "NAME": "sparkleColor", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "sparkleSpeed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 2.0 },
    { "NAME": "sparkleDensity", "TYPE": "float", "MIN": 0.01, "MAX": 1.0, "DEFAULT": 0.15 }
  ]
}*/

float pseudoRandom(vec2 seed) {
  return fract(sin(dot(seed, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  
  vec2 gridCoord = floor(uv * vec2(20.0, 20.0));
  vec2 cellUv = fract(uv * vec2(20.0, 20.0));
  
  float randomValue = pseudoRandom(gridCoord);
  
  if (randomValue < sparkleDensity) {
    float sparklePhase = fract(TIME * sparkleSpeed + randomValue * 6.28318);
    float sparkleBright = abs(sin(sparklePhase));
    sparkleBright = sparkleBright * sparkleBright;
    
    float distFromCenter = length(cellUv - vec2(0.5, 0.5));
    float sparkleShape = smoothstep(0.5, 0.0, distFromCenter);
    
    vec3 color = mix(baseColor.rgb, sparkleColor.rgb, sparkleBright * sparkleShape);
    gl_FragColor = vec4(color, 1.0);
  } else {
    gl_FragColor = vec4(baseColor.rgb, 1.0);
  }
}
