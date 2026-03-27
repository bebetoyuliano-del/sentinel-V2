class FallbackStorage:
    def __init__(self):
        self.records = []
        
    def add(self, record):
        self.records.append(record)
