# Synthetic source fixture. This file is parsed as text and is never executed.
class SyntheticMetadata:
    def _schema_v1(self):
        return StructType([
            StructField('ExampleKey', StringType(), False),
            StructField('ExampleValue', DoubleType(), True),
        ])
