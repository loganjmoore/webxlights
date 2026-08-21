/*{
  "DESCRIPTION": "Smooth wash that fades between the chosen colours",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.0, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 0.3 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.1, "MAX": 8.0, "DEFAULT": 1.0 },
    { "NAME": "softness", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.8 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  // Drive along x for most displays; for very short height (rooflines) keep it on x too.
  float coord = uv.x;
  float PI = 3.14159265;
  float TWO_PI = 6.28318530;

  // Slow moving phase across the model
  float phase = coord * scale + TIME * speed;

  // Base sinusoidal activations for up to three colours spaced in phase
  float a1 = 0.5 + 0.5 * sin(TWO_PI * phase + 0.0);
  float a2 = 0.5 + 0.5 * sin(TWO_PI * phase + 2.09439510); // +120 degrees
  float a3 = 0.5 + 0.5 * sin(TWO_PI * phase + 4.18879020); // +240 degrees

  // Map softness (0..1) to a sharpening exponent: low softness -> sharp transitions
  float sharp = mix(0.5, 6.0, 1.0 - softness);

  // Apply sharpening/softening
  a1 = pow(a1, sharp);
  a2 = pow(a2, sharp);
  a3 = pow(a3, sharp);

  // Combine based on how many colours the user provided
  vec3 col = vec3(0.0, 0.0, 0.0);
  if (NUMCOLORS == 1) {
    col = colorA.rgb;
  } else if (NUMCOLORS == 2) {
    // Use only a1 and a2
    float sum = a1 + a2 + 0.000001;
    float w1 = a1 / sum;
    float w2 = a2 / sum;
    col = w1 * colorA.rgb + w2 * colorB.rgb;
  } else {
    // Three or more colours: blend across A, B, C
    float sum = a1 + a2 + a3 + 0.000001;
    float w1 = a1 / sum;
    float w2 = a2 / sum;
    float w3 = a3 / sum;
    col = w1 * colorA.rgb + w2 * colorB.rgb + w3 * colorC.rgb;
  }

  // Ensure vivid output suitable for lights; slight gamma boost
  col = pow(col, vec3(0.95));

  gl_FragColor = vec4(col, 1.0);
}
